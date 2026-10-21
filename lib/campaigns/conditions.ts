import "server-only";
import { Prisma, type Campaign } from "@/generated/prisma/client";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { flagOn } from "@/lib/flags/eval";
import { getFlagStates } from "@/lib/flags/server";
import { CAMPAIGN_LAST_HOUR } from "@/lib/campaigns/rules";
import { addWeeks, availableFreezes, restoreOffer } from "@/lib/progress/weekly-streak";

export type Candidate = { userId: string; episode: string };

type CampaignInput = Pick<Campaign, "id" | "condition" | "days" | "push" | "telegram" | "hour">;

const DAY_MS = 86_400_000;

type StreakRow = {
  userId: string;
  timeZone: string;
  currentStreak: number;
  lastStreakWeek: string | null;
  streakFreezes: number;
  weekWorkouts: number;
  weekWorkoutsKey: string | null;
  freezeGrantedAt: Date | null;
  streakRestoredAt: Date | null;
};

/**
 * Кандидаты кампании — один SQL. Все дни — местные по User.timeZone; столбцы timestamp хранят UTC.
 * Фильтры отправки (спека, «Отправка», шаг 3) — в том же WHERE: notifyComeback, местный час, регистрация ≥ 24 ч назад
 * (кроме NEVER_TRAINED), канал кампании, нет отправки с тем же эпизодом. ignoreHour/ignoreSent — для «Кто попадёт сейчас».
 * Флаг campaigns здесь не проверяется (это делают processCampaigns и campaignAudience).
 */
export async function campaignCandidates(
  c: CampaignInput,
  now: Date,
  opts: { ignoreHour?: boolean; ignoreSent?: boolean } = {},
): Promise<Candidate[]> {
  if (c.condition !== "STREAK_LOST" && (c.days === null || c.days < 1)) return [];
  if (!c.push && !c.telegram) return [];

  const local = Prisma.sql`(${now}::timestamptz AT TIME ZONE u."timeZone")`;
  const today = Prisma.sql`${local}::date`;
  const regDay = Prisma.sql`((u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE u."timeZone")::date`;
  const channels = [
    ...(c.push ? [Prisma.sql`EXISTS (SELECT 1 FROM "PushSubscription" p WHERE p."userId" = u.id)`] : []),
    ...(c.telegram ? [Prisma.sql`(u."telegramChatId" IS NOT NULL AND u."notifyTelegram")`] : []),
  ];
  const base = [
    Prisma.sql`u."notifyComeback"`,
    Prisma.sql`(${Prisma.join(channels, " OR ")})`,
    ...(opts.ignoreHour
      ? []
      : [Prisma.sql`extract(hour FROM ${local}) >= ${c.hour}`, Prisma.sql`extract(hour FROM ${local}) < ${CAMPAIGN_LAST_HOUR}`]),
    ...(c.condition === "NEVER_TRAINED" ? [] : [Prisma.sql`u."createdAt" <= ${new Date(now.getTime() - DAY_MS)}`]),
  ];

  if (c.condition === "STREAK_LOST") return streakLostCandidates(c, now, base, opts.ignoreSent ?? false);

  const n = c.days!;
  let inner: Prisma.Sql;
  if (c.condition === "INACTIVE") {
    // Ни разу не засчитанный заход — считаем от местного дня регистрации
    const last = Prisma.sql`coalesce(u."lastLoginDay", ${regDay})`;
    inner = Prisma.sql`
      SELECT u.id AS "userId", to_char(${last}, 'YYYY-MM-DD') AS episode FROM "User" u
      WHERE ${Prisma.join([...base, Prisma.sql`${last} <= ${today} - ${n}::int`], " AND ")}`;
  } else if (c.condition === "NO_WORKOUT") {
    const lastDay = Prisma.sql`((lw.f AT TIME ZONE 'UTC') AT TIME ZONE u."timeZone")::date`;
    inner = Prisma.sql`
      SELECT u.id AS "userId", to_char(${lastDay}, 'YYYY-MM-DD') AS episode FROM "User" u
      CROSS JOIN LATERAL (
        SELECT max(w."finishedAt") AS f FROM "Workout" w WHERE w."userId" = u.id AND w.status = 'COMPLETED'
      ) lw
      WHERE ${Prisma.join(
        [
          ...base,
          Prisma.sql`u."lastLoginDay" > ${today} - ${n}::int`,
          Prisma.sql`lw.f IS NOT NULL`,
          Prisma.sql`${lastDay} <= ${today} - ${n}::int`,
        ],
        " AND ",
      )}`;
  } else {
    inner = Prisma.sql`
      SELECT u.id AS "userId", 'never' AS episode FROM "User" u
      WHERE ${Prisma.join(
        [
          ...base,
          Prisma.sql`${regDay} <= ${today} - ${n}::int`,
          Prisma.sql`NOT EXISTS (SELECT 1 FROM "Workout" w WHERE w."userId" = u.id AND w.status = 'COMPLETED')`,
        ],
        " AND ",
      )}`;
  }

  const notSent = opts.ignoreSent
    ? Prisma.empty
    : Prisma.sql`WHERE NOT EXISTS (
        SELECT 1 FROM "CampaignSend" s WHERE s."campaignId" = ${c.id} AND s."userId" = x."userId" AND s.episode = x.episode
      )`;
  return db.$queryRaw<Candidate[]>`SELECT x."userId", x.episode FROM (${inner}) x ${notSent}`;
}

/** STREAK_LOST: грубо в SQL, точно — restoreOffer; эпизод — неделя сгорания (lastStreakWeek + заморозки + 2). */
async function streakLostCandidates(c: CampaignInput, now: Date, base: Prisma.Sql[], ignoreSent: boolean): Promise<Candidate[]> {
  const rows = await db.$queryRaw<StreakRow[]>`
    SELECT u.id AS "userId", u."timeZone", u."currentStreak", u."lastStreakWeek", u."streakFreezes", u."weekWorkouts",
           u."weekWorkoutsKey", u."freezeGrantedAt", u."streakRestoredAt"
    FROM "User" u
    WHERE ${Prisma.join([...base, Prisma.sql`u."currentStreak" >= 2`, Prisma.sql`u."lastStreakWeek" IS NOT NULL`], " AND ")}
  `;
  const found = rows.flatMap((u) =>
    restoreOffer(u, now, safeTimeZone(u.timeZone))
      ? [{ userId: u.userId, episode: addWeeks(u.lastStreakWeek!, availableFreezes(u, now) + 2) }]
      : [],
  );
  if (ignoreSent || found.length === 0) return found;
  const sent = await db.campaignSend.findMany({
    where: { campaignId: c.id, userId: { in: found.map((f) => f.userId) } },
    select: { userId: true, episode: true },
  });
  const done = new Set(sent.map((s) => `${s.userId}:${s.episode}`));
  return found.filter((f) => !done.has(`${f.userId}:${f.episode}`));
}

/** «Кто попадёт сейчас»: кандидаты без часа отправки, лимитов и уже отправленных — с учётом флага campaigns. */
export async function campaignAudience(c: CampaignInput, now = new Date()): Promise<number> {
  const state = (await getFlagStates()).get("campaigns") ?? null;
  if (!state?.enabled) return 0;
  const list = await campaignCandidates(c, now, { ignoreHour: true, ignoreSent: true });
  return list.filter((x) => flagOn("campaigns", state, x.userId)).length;
}

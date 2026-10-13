import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays, cohortGrid, fillDays, type CohortRow, type DayPoint } from "@/lib/admin/metrics";

/*
 * Метрики админки — агрегаты по всей базе, дни и недели (с понедельника) — в поясе админа.
 * Активный = день в журнале заходов (UserVisit) или завершённая тренировка в этот местный день.
 */

const COHORTS = 8;

/** Местный день метки времени (столбцы timestamp хранят UTC). */
const localDay = (col: Prisma.Sql, tz: string) => Prisma.sql`((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date`;

/** Отсечка по UTC с запасом в сутки — дальше фильтр по местному дню. */
const utcFloor = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000);

/** Дни активности (заходы ∪ тренировки) начиная с from; UNION убирает дубли «зашёл и тренировался». */
const activitySql = (tz: string, from: string) => Prisma.sql`
  SELECT "userId", day FROM "UserVisit" WHERE day >= ${from}::date
  UNION
  SELECT "userId", ${localDay(Prisma.sql`"finishedAt"`, tz)} AS day
  FROM "Workout"
  WHERE status = 'COMPLETED' AND "finishedAt" >= ${utcFloor(from)} AND ${localDay(Prisma.sql`"finishedAt"`, tz)} >= ${from}::date
`;

function mondayOf(day: string) {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

export type Overview = {
  users: number;
  newToday: number;
  new7: number;
  new7Prev: number;
  new30: number;
  new30Prev: number;
  dau: number;
  wau: number;
  wauPrev: number;
  mau: number;
  mauPrev: number;
  workouts: number;
  workouts7: number;
  workouts7Prev: number;
  workouts30: number;
  workouts30Prev: number;
  hours30: number;
  hours30Prev: number;
  avgMinutes30: number | null;
};

/** Плитки: «7 дн» — сегодня и 6 дней до него, «пред.» — 7 дней перед ними; так же 30. */
export async function getOverview(tz: string): Promise<Overview> {
  const today = dayKey(new Date(), tz);
  const d7 = addDays(today, -6);
  const d14 = addDays(today, -13);
  const d30 = addDays(today, -29);
  const d60 = addDays(today, -59);
  const signup = localDay(Prisma.sql`"createdAt"`, tz);
  const finished = localDay(Prisma.sql`"finishedAt"`, tz);
  const [row] = await db.$queryRaw<(Omit<Overview, "hours30" | "hours30Prev" | "avgMinutes30"> & { sec30: number; sec30Prev: number })[]>`
    WITH a AS (${activitySql(tz, d60)}),
    w AS (
      SELECT "durationSec" AS sec, ${finished} AS day FROM "Workout"
      WHERE status = 'COMPLETED' AND "finishedAt" >= ${utcFloor(d60)}
    )
    SELECT
      (SELECT COUNT(*) FROM "User")::int AS users,
      (SELECT COUNT(*) FROM "User" WHERE ${signup} = ${today}::date)::int AS "newToday",
      (SELECT COUNT(*) FROM "User" WHERE ${signup} >= ${d7}::date)::int AS new7,
      (SELECT COUNT(*) FROM "User" WHERE ${signup} >= ${d14}::date AND ${signup} < ${d7}::date)::int AS "new7Prev",
      (SELECT COUNT(*) FROM "User" WHERE ${signup} >= ${d30}::date)::int AS new30,
      (SELECT COUNT(*) FROM "User" WHERE ${signup} >= ${d60}::date AND ${signup} < ${d30}::date)::int AS "new30Prev",
      (SELECT COUNT(DISTINCT "userId") FROM a WHERE day = ${today}::date)::int AS dau,
      (SELECT COUNT(DISTINCT "userId") FROM a WHERE day >= ${d7}::date)::int AS wau,
      (SELECT COUNT(DISTINCT "userId") FROM a WHERE day >= ${d14}::date AND day < ${d7}::date)::int AS "wauPrev",
      (SELECT COUNT(DISTINCT "userId") FROM a WHERE day >= ${d30}::date)::int AS mau,
      (SELECT COUNT(DISTINCT "userId") FROM a WHERE day >= ${d60}::date AND day < ${d30}::date)::int AS "mauPrev",
      (SELECT COUNT(*) FROM "Workout" WHERE status = 'COMPLETED')::int AS workouts,
      (SELECT COUNT(*) FROM w WHERE day >= ${d7}::date)::int AS workouts7,
      (SELECT COUNT(*) FROM w WHERE day >= ${d14}::date AND day < ${d7}::date)::int AS "workouts7Prev",
      (SELECT COUNT(*) FROM w WHERE day >= ${d30}::date)::int AS workouts30,
      (SELECT COUNT(*) FROM w WHERE day >= ${d60}::date AND day < ${d30}::date)::int AS "workouts30Prev",
      (SELECT COALESCE(SUM(sec), 0) FROM w WHERE day >= ${d30}::date)::int AS sec30,
      (SELECT COALESCE(SUM(sec), 0) FROM w WHERE day >= ${d60}::date AND day < ${d30}::date)::int AS "sec30Prev"
  `;
  const { sec30, sec30Prev, ...counts } = row;
  return {
    ...counts,
    hours30: Math.round(sec30 / 360) / 10,
    hours30Prev: Math.round(sec30Prev / 360) / 10,
    avgMinutes30: counts.workouts30 ? Math.round(sec30 / 60 / counts.workouts30) : null,
  };
}

export type DailySeries = { signups: DayPoint[]; visited: DayPoint[]; trained: DayPoint[]; workouts: DayPoint[] };

/** Ряды по дням за range дней, включая сегодня. */
export async function getDailySeries(tz: string, range: 30 | 90): Promise<DailySeries> {
  const today = dayKey(new Date(), tz);
  const from = addDays(today, -(range - 1));
  const signup = localDay(Prisma.sql`"createdAt"`, tz);
  const finished = localDay(Prisma.sql`"finishedAt"`, tz);
  const rows = await db.$queryRaw<{ series: keyof DailySeries; day: string; value: number }[]>`
    SELECT 'signups' AS series, to_char(${signup}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS value
    FROM "User" WHERE "createdAt" >= ${utcFloor(from)} AND ${signup} >= ${from}::date GROUP BY 2
    UNION ALL
    SELECT 'visited', to_char(day, 'YYYY-MM-DD'), COUNT(DISTINCT "userId")::int
    FROM "UserVisit" WHERE day >= ${from}::date GROUP BY 2
    UNION ALL
    SELECT 'trained', to_char(${finished}, 'YYYY-MM-DD'), COUNT(DISTINCT "userId")::int
    FROM "Workout" WHERE status = 'COMPLETED' AND "finishedAt" >= ${utcFloor(from)} AND ${finished} >= ${from}::date GROUP BY 2
    UNION ALL
    SELECT 'workouts', to_char(${finished}, 'YYYY-MM-DD'), COUNT(*)::int
    FROM "Workout" WHERE status = 'COMPLETED' AND "finishedAt" >= ${utcFloor(from)} AND ${finished} >= ${from}::date GROUP BY 2
  `;
  const pick = (s: keyof DailySeries) =>
    fillDays(
      rows.filter((r) => r.series === s).map(({ day, value }) => ({ day, value })),
      from,
      today,
    );
  return { signups: pick("signups"), visited: pick("visited"), trained: pick("trained"), workouts: pick("workouts") };
}

/** Удержание: последние 8 недель регистрации (включая текущую) × недели 0…6 после неё. */
export async function getCohorts(tz: string): Promise<CohortRow[]> {
  const currentWeek = mondayOf(dayKey(new Date(), tz));
  const from = addDays(currentWeek, -7 * (COHORTS - 1));
  const signup = localDay(Prisma.sql`"createdAt"`, tz);
  const [sizes, active] = await Promise.all([
    db.$queryRaw<{ week: string; size: number }[]>`
      SELECT to_char(date_trunc('week', ${signup}), 'YYYY-MM-DD') AS week, COUNT(*)::int AS size
      FROM "User" WHERE "createdAt" >= ${utcFloor(from)} AND ${signup} >= ${from}::date GROUP BY 1
    `,
    db.$queryRaw<{ week: string; offset: number; users: number }[]>`
      WITH u AS (
        SELECT id, date_trunc('week', ${signup})::date AS week
        FROM "User" WHERE "createdAt" >= ${utcFloor(from)} AND ${signup} >= ${from}::date
      ), a AS (${activitySql(tz, from)}),
      c AS (
        SELECT u.id, to_char(u.week, 'YYYY-MM-DD') AS week, ((date_trunc('week', a.day)::date - u.week) / 7)::int AS "offset"
        FROM u JOIN a ON a."userId" = u.id AND a.day >= u.week
      )
      SELECT week, "offset", COUNT(DISTINCT id)::int AS users FROM c WHERE "offset" BETWEEN 0 AND 6 GROUP BY 1, 2
    `,
  ]);
  const bySize = new Map(sizes.map((s) => [s.week, s.size]));
  const cohorts = Array.from({ length: COHORTS }, (_, i) => {
    const week = addDays(from, 7 * i);
    return { week, size: bySize.get(week) ?? 0 };
  });
  return cohortGrid(cohorts, active, currentWeek);
}

export type FeatureUsage = {
  coaches: number;
  coachesWithClients: number;
  activeClients: number;
  telegramNotify: number;
  telegramMiniApp: number;
  push: number;
  guilds: number;
  guildMembers: number;
  clubs: number;
  clubMembers: number;
  activeGoals: number;
  buyers: number;
  coins: number;
  onboarded: number;
  users: number;
};

/** Срез использования фич на сейчас. */
export async function getFeatureUsage(): Promise<FeatureUsage> {
  const [row] = await db.$queryRaw<FeatureUsage[]>`
    SELECT
      (SELECT COUNT(*) FROM "User" WHERE "isCoach")::int AS coaches,
      (SELECT COUNT(DISTINCT l."coachId") FROM "CoachLink" l JOIN "User" c ON c.id = l."coachId" AND c."isCoach" WHERE l."endedAt" IS NULL)::int AS "coachesWithClients",
      (SELECT COUNT(*) FROM "CoachLink" WHERE "endedAt" IS NULL)::int AS "activeClients",
      (SELECT COUNT(*) FROM "User" WHERE "telegramChatId" IS NOT NULL)::int AS "telegramNotify",
      (SELECT COUNT(*) FROM "User" WHERE "telegramId" IS NOT NULL)::int AS "telegramMiniApp",
      (SELECT COUNT(DISTINCT "userId") FROM "PushSubscription")::int AS push,
      (SELECT COUNT(*) FROM "Guild")::int AS guilds,
      (SELECT COUNT(*) FROM "GuildMember")::int AS "guildMembers",
      (SELECT COUNT(*) FROM "Club" WHERE status = 'APPROVED')::int AS clubs,
      (SELECT COUNT(*) FROM "ClubMember" m JOIN "Club" c ON c.id = m."clubId" WHERE c.status = 'APPROVED')::int AS "clubMembers",
      (SELECT COUNT(DISTINCT "userId") FROM "Goal" WHERE status = 'ACTIVE')::int AS "activeGoals",
      (SELECT COUNT(DISTINCT "userId") FROM "UserItem")::int AS buyers,
      (SELECT COALESCE(SUM(coins), 0) FROM "User")::int AS coins,
      (SELECT COUNT(*) FROM "User" WHERE "onboardedAt" IS NOT NULL)::int AS onboarded,
      (SELECT COUNT(*) FROM "User")::int AS users
  `;
  return row;
}

import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { FriendshipStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { streakStatus } from "@/lib/progress/streak";
import { generateFriendCode, percentile, rankLeague, type LeagueMember } from "@/lib/social/league";

/** XP лиги — только за тренировки и побитые рекорды (ачивки и ежедневный вход не дают форы). */
const LEAGUE_REASONS = Prisma.sql`('WORKOUT_COMPLETED', 'PERSONAL_RECORD')`;
const ACTIVE_DAYS = 28;

/** Личный код для приглашений: создаётся при первом заходе в рейтинг. */
export async function ensureFriendCode(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { friendCode: true } });
  if (user.friendCode) return user.friendCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Условие friendCode = null — параллельные запросы не перезапишут код друг друга.
      const { count } = await db.user.updateMany({
        where: { id: userId, friendCode: null },
        data: { friendCode: generateFriendCode() },
      });
      if (count === 1) break;
    } catch (e) {
      // Совпал с чужим кодом — пробуем другой.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  const saved = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { friendCode: true } });
  if (!saved.friendCode) throw new Error("Не удалось создать код друга");
  return saved.friendCode;
}

async function friendIds(userId: string) {
  const rows = await db.friendship.findMany({
    where: { status: FriendshipStatus.ACCEPTED, OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
}

/**
 * Границы недели (пн 00:00 – следующий пн 00:00) в поясе пользователя как timestamptz; offset 1 — прошлая.
 * Колонки хранят UTC без пояса, поэтому сравниваем с ("col" AT TIME ZONE 'UTC').
 */
const weekBounds = (timeZone: string, offset: number) => Prisma.sql`
  SELECT (date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset})) AT TIME ZONE ${timeZone} AS start_at,
         (date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset}) + interval '7 days') AT TIME ZONE ${timeZone} AS end_at
`;

type LeagueRow = Omit<LeagueMember, "streak"> & { currentStreak: number; lastStreakAt: Date | null; streakFreezes: number };

/** Лига: я и мои друзья — XP за тренировки и число тренировок за неделю. */
export async function getLeague(userId: string, timeZone: string, offset: 0 | 1) {
  const ids = [userId, ...(await friendIds(userId))];
  const [rows, [week]] = await Promise.all([
    db.$queryRaw<LeagueRow[]>`
      WITH b AS (${weekBounds(timeZone, offset)})
      SELECT u.id, COALESCE(u.nickname, '') AS nickname, u.level,
             u."currentStreak", u."lastStreakAt", u."streakFreezes",
             COALESCE((
               SELECT SUM(x.amount) FROM "XpEvent" x
               WHERE x."userId" = u.id AND x.reason::text IN ${LEAGUE_REASONS}
                 AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
             ), 0)::int AS xp,
             (
               SELECT COUNT(*) FROM "Workout" w
               WHERE w."userId" = u.id AND w.status = 'COMPLETED'
                 AND (w."finishedAt" AT TIME ZONE 'UTC') >= b.start_at AND (w."finishedAt" AT TIME ZONE 'UTC') < b.end_at
             )::int AS workouts
      FROM "User" u, b
      WHERE u.id = ANY(${ids})
    `,
    db.$queryRaw<{ start: string }[]>`
      SELECT to_char(date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset}), 'YYYY-MM-DD') AS start
    `,
  ]);
  const now = new Date();
  const members: LeagueMember[] = rows.map(({ currentStreak, lastStreakAt, streakFreezes, ...m }) => {
    // Серия «на сейчас»: потерянная не показывается.
    const status = streakStatus({ currentStreak, lastStreakAt, streakFreezes }, now);
    return { ...m, streak: status.state === "none" || status.state === "lost" ? 0 : status.streak };
  });
  return { weekStart: week.start, members: rankLeague(members, userId), friends: ids.length - 1 };
}

/** Анонимный процентиль XP за текущую неделю среди тех, кто тренировался за последние 4 недели. */
export async function getPercentile(userId: string, timeZone: string) {
  const [row] = await db.$queryRaw<{ myXp: number; below: number; others: number }[]>`
    WITH b AS (${weekBounds(timeZone, 0)}),
    xp AS (
      SELECT x."userId", SUM(x.amount) AS xp
      FROM "XpEvent" x, b
      WHERE x.reason::text IN ${LEAGUE_REASONS}
        AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
      GROUP BY x."userId"
    ),
    active AS (
      SELECT DISTINCT "userId" FROM "Workout"
      WHERE status = 'COMPLETED' AND "finishedAt" >= now() - make_interval(days => ${ACTIVE_DAYS})
        AND "userId" <> ${userId}
    ),
    me AS (SELECT COALESCE((SELECT xp FROM xp WHERE "userId" = ${userId}), 0) AS xp)
    SELECT me.xp::int AS "myXp",
           (SELECT COUNT(*) FROM active a LEFT JOIN xp ON xp."userId" = a."userId" WHERE COALESCE(xp.xp, 0) < me.xp)::int AS below,
           (SELECT COUNT(*) FROM active)::int AS others
    FROM me
  `;
  return { myXp: row.myXp, percentile: percentile(row.below, row.others) };
}

/** Друзья и заявки — для управления на странице рейтинга. */
export async function getFriends(userId: string) {
  const rows = await db.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      requesterId: true,
      requester: { select: { nickname: true, level: true } },
      addressee: { select: { nickname: true, level: true } },
    },
  });
  const view = (r: (typeof rows)[number]) => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    return { id: r.id, nickname: other.nickname ?? "—", level: other.level };
  };
  return {
    friends: rows.filter((r) => r.status === FriendshipStatus.ACCEPTED).map(view),
    incoming: rows.filter((r) => r.status === FriendshipStatus.PENDING && r.requesterId !== userId).map(view),
    outgoing: rows.filter((r) => r.status === FriendshipStatus.PENDING && r.requesterId === userId).map(view),
  };
}

/** Кто пригласил по ссылке ?invite=CODE (без ника приглашать нельзя — не показываем). */
export async function getInviter(code: string, userId: string) {
  const user = await db.user.findUnique({ where: { friendCode: code }, select: { id: true, nickname: true, level: true } });
  if (!user || user.id === userId || !user.nickname) return null;
  const relation = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: user.id },
        { requesterId: user.id, addresseeId: userId },
      ],
    },
    select: { status: true },
  });
  return { nickname: user.nickname, level: user.level, status: relation?.status ?? null };
}

export type League = Awaited<ReturnType<typeof getLeague>>;
export type Friends = Awaited<ReturnType<typeof getFriends>>;

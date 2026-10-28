import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { FriendshipStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { streakStatus, streakValue, type StreakUserFields } from "@/lib/progress/weekly-streak";
import { decodeCursor, encodeCursor, toFeedEntry, type FeedRow } from "@/lib/social/feed";
import { generateFriendCode, percentile, rankLeague, type LeagueMember } from "@/lib/social/league";
import { COSMETIC_SELECT } from "@/lib/shop/cosmetics";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";
import { titleLabel } from "@/lib/titles/catalog";

/** XP лиги — только за тренировки и побитые рекорды (ачивки и ежедневный вход не дают форы). */
export const LEAGUE_REASONS = Prisma.sql`('WORKOUT_COMPLETED', 'PERSONAL_RECORD')`;
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

export async function friendIds(userId: string) {
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
export const weekBounds = (timeZone: string, offset: number) => Prisma.sql`
  SELECT (date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset})) AT TIME ZONE ${timeZone} AS start_at,
         (date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset}) + interval '7 days') AT TIME ZONE ${timeZone} AS end_at
`;

type LeagueRow = Omit<LeagueMember, "streak" | "title" | "cosmetics"> &
  StreakUserFields & { timeZone: string; titleCode: string | null; avatarCode: string | null; frameCode: string | null; nickColorCode: string | null };

/** Лига: я и мои друзья — XP за тренировки и число тренировок за неделю. */
export async function getLeague(userId: string, timeZone: string, offset: 0 | 1) {
  const ids = [userId, ...(await friendIds(userId))];
  const [rows, [week]] = await Promise.all([
    db.$queryRaw<LeagueRow[]>`
      WITH b AS (${weekBounds(timeZone, offset)})
      SELECT u.id, COALESCE(u.nickname, '') AS nickname, u."titleCode", u.level,
             u."avatarCode", u."frameCode", u."nickColorCode",
             u."currentStreak", u."lastStreakWeek", u."streakFreezes", u."weekWorkouts", u."weekWorkoutsKey", u."freezeGrantedAt", u."timeZone",
             COALESCE((
               SELECT SUM(x.amount) FROM "XpEvent" x
               WHERE x."userId" = u.id AND x.reason::text IN ${LEAGUE_REASONS}
                 AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
             ), 0)::int AS xp,
             (
               SELECT COUNT(*) FROM "Workout" w
               WHERE w."userId" = u.id AND w.status = 'COMPLETED' AND NOT w."stretchOnly"
                 AND (w."finishedAt" AT TIME ZONE 'UTC') >= b.start_at AND (w."finishedAt" AT TIME ZONE 'UTC') < b.end_at
             )::int AS workouts,
             EXISTS (
               SELECT 1 FROM "BossWeek" bw
               WHERE bw."userId" = u.id AND bw."defeatedAt" IS NOT NULL
                 AND bw.week = to_char(date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset}), 'YYYY-MM-DD')
             ) AS "bossDefeated"
      FROM "User" u, b
      WHERE u.id = ANY(${ids})
    `,
    db.$queryRaw<{ start: string }[]>`
      SELECT to_char(date_trunc('week', now() AT TIME ZONE ${timeZone}) - make_interval(weeks => ${offset}), 'YYYY-MM-DD') AS start
    `,
  ]);
  const now = new Date();
  const cosmetics = await cosmeticsLoader();
  const members: LeagueMember[] = rows.map(
    ({ currentStreak, lastStreakWeek, streakFreezes, weekWorkouts, weekWorkoutsKey, freezeGrantedAt, timeZone: tz, titleCode, avatarCode, frameCode, nickColorCode, ...m }) => {
      // Серия «на сейчас» в поясе участника: потерянная не показывается.
      const user = { currentStreak, lastStreakWeek, streakFreezes, weekWorkouts, weekWorkoutsKey, freezeGrantedAt };
      return { ...m, title: titleLabel(titleCode), cosmetics: cosmetics({ id: m.id, avatarCode, frameCode, nickColorCode }), streak: streakValue(streakStatus(user, now, safeTimeZone(tz))) };
    },
  );
  return { weekStart: week.start, members: rankLeague(members, userId), friends: ids.length - 1 };
}

/** Анонимный процентиль XP за текущую неделю среди тех, кто тренировался за последние 4 недели. */
export async function getPercentile(userId: string, timeZone: string) {
  return percentileQuery(userId, weekBounds(timeZone, 0), Prisma.sql`"finishedAt" >= now() - make_interval(days => ${ACTIVE_DAYS})`);
}

/** Процентиль XP за неделю [start, end) среди тех, кто тренировался за 4 недели до её конца (итоги недели). */
export async function weekPercentile(userId: string, start: Date, end: Date) {
  return percentileQuery(
    userId,
    Prisma.sql`SELECT ${start}::timestamptz AS start_at, ${end}::timestamptz AS end_at`,
    // Активные — только за 4 недели до конца этой недели (не позже: старые итоги не учитывают будущих атлетов)
    Prisma.sql`"finishedAt" >= ${new Date(end.getTime() - ACTIVE_DAYS * 24 * 3600 * 1000)}::timestamptz AT TIME ZONE 'UTC'
      AND "finishedAt" < ${end}::timestamptz AT TIME ZONE 'UTC'`,
  );
}

async function percentileQuery(userId: string, bounds: Prisma.Sql, activeWhen: Prisma.Sql) {
  const [row] = await db.$queryRaw<{ myXp: number; below: number; others: number }[]>`
    WITH b AS (${bounds}),
    xp AS (
      SELECT x."userId", SUM(x.amount) AS xp
      FROM "XpEvent" x, b
      WHERE x.reason::text IN ${LEAGUE_REASONS}
        AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
      GROUP BY x."userId"
    ),
    active AS (
      SELECT DISTINCT "userId" FROM "Workout"
      WHERE status = 'COMPLETED' AND ${activeWhen}
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
      requester: { select: { id: true, nickname: true, level: true, titleCode: true, ...COSMETIC_SELECT } },
      addressee: { select: { id: true, nickname: true, level: true, titleCode: true, ...COSMETIC_SELECT } },
    },
  });
  const cosmetics = await cosmeticsLoader();
  const view = (r: (typeof rows)[number]) => {
    const other = r.requesterId === userId ? r.addressee : r.requester;
    return { id: r.id, nickname: other.nickname ?? "—", level: other.level, title: titleLabel(other.titleCode), cosmetics: cosmetics(other) };
  };
  return {
    friends: rows.filter((r) => r.status === FriendshipStatus.ACCEPTED).map(view),
    incoming: rows.filter((r) => r.status === FriendshipStatus.PENDING && r.requesterId !== userId).map(view),
    outgoing: rows.filter((r) => r.status === FriendshipStatus.PENDING && r.requesterId === userId).map(view),
  };
}

/** Кто пригласил по ссылке ?invite=CODE (без ника приглашать нельзя — не показываем). */
export async function getInviter(code: string, userId: string) {
  const user = await db.user.findUnique({ where: { friendCode: code }, select: { id: true, nickname: true, level: true, titleCode: true } });
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
  return { nickname: user.nickname, level: user.level, title: titleLabel(user.titleCode), status: relation?.status ?? null };
}

export type League = Awaited<ReturnType<typeof getLeague>>;
export type Friends = Awaited<ReturnType<typeof getFriends>>;

// ───────────────────────────── Лента активности ─────────────────────────────

export const FEED_PAGE = 15;

/** Я и те из `others`, кто делится тренировками. */
async function sharingWith(userId: string, others: string[]) {
  if (others.length === 0) return [userId];
  const sharing = await db.user.findMany({ where: { id: { in: others }, shareActivity: true }, select: { id: true } });
  return [userId, ...sharing.map((u) => u.id)];
}

/** Чью активность я вижу: свою и друзей, которые делятся тренировками. */
async function feedAuthorIds(userId: string) {
  return sharingWith(userId, await friendIds(userId));
}

/** Согильдийцы (без меня). */
export async function guildMateIds(userId: string): Promise<string[]> {
  const me = await db.guildMember.findUnique({ where: { userId }, select: { guildId: true } });
  if (!me) return [];
  const rows = await db.guildMember.findMany({ where: { guildId: me.guildId, userId: { not: userId } }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

/** Чья активность в ленте гильдии: моя и согильдийцев, которые делятся тренировками. */
async function guildAuthorIds(userId: string) {
  return sharingWith(userId, await guildMateIds(userId));
}

/**
 * Можно ли пользователю видеть (и поддержать) тренировку — та же проверка, что и для лент: автор — я, друг или
 * согильдиец, который делится тренировками. `friend` — видна через дружбу (для ссылки уведомления).
 */
export async function canSeeWorkout(userId: string, workoutId: string) {
  const workout = await db.workout.findUnique({ where: { id: workoutId }, select: { userId: true, status: true } });
  if (!workout || workout.status !== "COMPLETED") return null;
  if ((await feedAuthorIds(userId)).includes(workout.userId)) return { ...workout, friend: true };
  if ((await guildAuthorIds(userId)).includes(workout.userId)) return { ...workout, friend: false };
  return null;
}

/** Лента друзей. */
export async function getFeed(userId: string, cursor: string | null, limit = FEED_PAGE) {
  return feedPage(userId, await feedAuthorIds(userId), cursor, limit);
}

/** Лента гильдии; `friends` в ответе — число согильдийцев, которые делятся. */
export async function getGuildFeed(userId: string, cursor: string | null, limit = FEED_PAGE) {
  return feedPage(userId, await guildAuthorIds(userId), cursor, limit);
}

/** Страница ленты по авторам (новые сверху). Скрытие весов применяется здесь же — в браузер они не уходят. */
async function feedPage(userId: string, ids: string[], cursor: string | null, limit: number) {
  const after = decodeCursor(cursor);
  const rows = await db.$queryRaw<FeedRow[]>`
    SELECT w.id, w."userId", u.nickname, u."titleCode", u."avatarCode", u."frameCode", u."nickColorCode", u."hideWeights", w.name, w."finishedAt", w."durationSec",
           w."totalVolume", w."totalSets", w."totalReps", x.meta,
           (
             SELECT g.name FROM "RaidWeek" r JOIN "Guild" g ON g.id = r."guildId"
             WHERE r.id = x.meta->'raid'->>'raidId'
           ) AS "raidGuild",
           (
             SELECT json_agg(json_build_object('name', e.name, 'top', t.top) ORDER BY we."order")
             FROM "WorkoutExercise" we
             JOIN "Exercise" e ON e.id = we."exerciseId"
             LEFT JOIN LATERAL (
               SELECT MAX(s.weight) AS top FROM "WorkoutSet" s
               WHERE s."workoutExerciseId" = we.id AND s."isWarmup" = false
             ) t ON true
             WHERE we."workoutId" = w.id
           ) AS exercises,
           (SELECT COUNT(*) FROM "Kudos" k WHERE k."workoutId" = w.id)::int AS kudos,
           EXISTS (SELECT 1 FROM "Kudos" k WHERE k."workoutId" = w.id AND k."userId" = ${userId}) AS "byMe",
           (
             SELECT array_agg(z.nickname) FROM (
               SELECT ku.nickname FROM "Kudos" k JOIN "User" ku ON ku.id = k."userId"
               WHERE k."workoutId" = w.id AND k."userId" <> ${userId}
               ORDER BY k."createdAt" DESC LIMIT 2
             ) z
           ) AS "kudosNames",
           (
             SELECT json_agg(json_build_object('exerciseId', g."exerciseId", 'count', g.cnt, 'byMe', g."byMe", 'names', g.names))
             FROM (
               SELECT rr."exerciseId", COUNT(*)::int AS cnt, bool_or(rr."userId" = ${userId}) AS "byMe",
                      (
                        SELECT array_agg(z.nickname) FROM (
                          SELECT ru.nickname FROM "RecordRespect" r2 JOIN "User" ru ON ru.id = r2."userId"
                          WHERE r2."workoutId" = w.id AND r2."exerciseId" = rr."exerciseId" AND r2."userId" <> ${userId}
                          ORDER BY r2."createdAt" DESC LIMIT 2
                        ) z
                      ) AS names
               FROM "RecordRespect" rr WHERE rr."workoutId" = w.id GROUP BY rr."exerciseId"
             ) g
           ) AS respects
    FROM "Workout" w
    JOIN "User" u ON u.id = w."userId"
    LEFT JOIN "XpEvent" x ON x."workoutId" = w.id AND x.reason IN ('WORKOUT_COMPLETED', 'STRETCH_SESSION')
    WHERE w.status = 'COMPLETED' AND w."finishedAt" IS NOT NULL AND w."userId" = ANY(${ids})
      ${after ? Prisma.sql`AND (w."finishedAt", w.id) < (${after.at}, ${after.id})` : Prisma.empty}
    ORDER BY w."finishedAt" DESC, w.id DESC
    LIMIT ${limit + 1}
  `;
  const cosmetics = await cosmeticsLoader();
  const entries = rows.slice(0, limit).map((r) => toFeedEntry(r, userId, cosmetics({ ...r, id: r.userId })));
  return { entries, next: rows.length > limit ? encodeCursor(entries.at(-1)!) : null, friends: ids.length - 1 };
}

export type Feed = Awaited<ReturnType<typeof getFeed>>;

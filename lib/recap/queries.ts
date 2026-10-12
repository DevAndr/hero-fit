import "server-only";
import { weekDamage } from "@/lib/boss/queries";
import { raidBossName } from "@/lib/raid/rules";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { StreakCoverReason, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { db } from "@/lib/db";
import { addWeeks, localMidnight, streakStatus, streakValue } from "@/lib/progress/weekly-streak";
import { addDays } from "@/lib/plans/expand";
import { getCalendar } from "@/lib/plans/queries";
import { friendIds, LEAGUE_REASONS, weekPercentile } from "@/lib/social/queries";
import type { FinishMeta } from "@/lib/workouts/finish";
import { isEnabled } from "@/lib/flags/server";
import { exerciseWeekBests } from "@/lib/stats/strength-queries";
import { buildRecap } from "./build";
import { isRecapWeek } from "./schedule";
import type { RecapData, RecapInput, RecapRaid } from "./types";

export type WeeklyRecapRow = { id: string; week: string; data: RecapData; createdAt: Date; pushedAt: Date | null; seenAt: Date | null };

const recapSelect = { id: true, week: true, data: true, createdAt: true, pushedAt: true, seenAt: true } as const;
const toRow = (r: { id: string; week: string; data: unknown; createdAt: Date; pushedAt: Date | null; seenAt: Date | null }): WeeklyRecapRow => ({
  ...r,
  data: r.data as RecapData,
});

/** Неделя [start, end) — от понедельника 00:00 до следующего понедельника 00:00 в поясе tz. */
const bounds = (week: string, tz: string) => ({ start: localMidnight(week, tz), end: localMidnight(addWeeks(week, 1), tz) });

async function weekWorkouts(userId: string, start: Date, end: Date) {
  return db.workout.findMany({
    where: { userId, status: WorkoutStatus.COMPLETED, finishedAt: { gte: start, lt: end } },
    select: { id: true, durationSec: true, totalVolume: true, totalSets: true, finishedAt: true },
    orderBy: { finishedAt: "asc" },
  });
}

async function leagueMembers(userId: string, start: Date, end: Date): Promise<RecapInput["league"]> {
  const friends = await friendIds(userId);
  if (!friends.length) return null;
  const members = await db.$queryRaw<{ id: string; nickname: string; xp: number; workouts: number }[]>`
    SELECT u.id, COALESCE(u.nickname, '') AS nickname,
           COALESCE((
             SELECT SUM(x.amount) FROM "XpEvent" x
             WHERE x."userId" = u.id AND x.reason::text IN ${LEAGUE_REASONS}
               AND x."createdAt" >= ${start} AND x."createdAt" < ${end}
           ), 0)::int AS xp,
           (
             SELECT COUNT(*) FROM "Workout" w
             WHERE w."userId" = u.id AND w.status = 'COMPLETED' AND w."finishedAt" >= ${start} AND w."finishedAt" < ${end}
           )::int AS workouts
    FROM "User" u
    WHERE u.id = ANY(${[userId, ...friends]})
  `;
  return { meId: userId, members };
}

/** Подходы по основной группе мышц по неделям (в поясе tz) — неделя week и 5 предыдущих. */
async function muscleSets(userId: string, week: string, tz: string): Promise<RecapInput["muscleSets"]> {
  const from = localMidnight(addWeeks(week, -5), tz);
  const { end } = bounds(week, tz);
  return db.$queryRaw<{ group: MuscleGroup; week: string; sets: number }[]>`
    SELECT e."muscleGroups"[1]::text AS "group",
           to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
           COUNT(*)::int AS sets
    FROM "WorkoutSet" s
    JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
    JOIN "Workout" w ON w.id = we."workoutId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${from} AND w."finishedAt" < ${end}
      AND s."completedAt" IS NOT NULL AND NOT s."isWarmup" AND cardinality(e."muscleGroups") > 0
    GROUP BY 1, 2
  `;
}

/**
 * Рейд гильдии недели: рейды, в которые игрок бил тренировками, завершёнными в [start, end) (его неделя — окно рейда
 * в поясе главы может не совпадать); при нескольких — с наибольшим моим уроном за весь рейд. Место — среди всех бивших,
 * включая вышедших.
 */
export async function weekRaid(userId: string, start: Date, end: Date): Promise<RecapRaid | null> {
  const rows = await db.$queryRaw<{ id: string; bossCode: string; hp: number; defeated: boolean; mvp: boolean; damage: number; mine: number; place: number; members: number }[]>`
    WITH mine AS (
      -- Рейды, в которые бил игрок тренировками своей недели (окно рейда — в поясе главы, может сдвигаться)
      SELECT DISTINCT h."raidId" AS id FROM "RaidHit" h JOIN "Workout" w ON w.id = h."workoutId"
      WHERE h."userId" = ${userId} AND w."finishedAt" >= ${start} AND w."finishedAt" < ${end}
    ),
    per AS (
      SELECT h."raidId", h."userId", SUM(h.damage)::int AS damage FROM "RaidHit" h
      WHERE h."raidId" IN (SELECT id FROM mine) GROUP BY 1, 2
    )
    SELECT r.id, r."bossCode", r.hp, r."defeatedAt" IS NOT NULL AS defeated, r."mvpUserId" IS NOT DISTINCT FROM ${userId} AS mvp,
           (SELECT SUM(p.damage) FROM per p WHERE p."raidId" = r.id)::int AS damage,
           me.damage AS mine,
           (1 + (SELECT COUNT(*) FROM per p WHERE p."raidId" = r.id AND p.damage > me.damage))::int AS place,
           (SELECT COUNT(*) FROM per p WHERE p."raidId" = r.id)::int AS members
    FROM "RaidWeek" r JOIN per me ON me."raidId" = r.id AND me."userId" = ${userId}
    ORDER BY me.damage DESC
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return null;
  return { name: raidBossName(r.bossCode), code: r.bossCode, defeated: r.defeated, damage: r.damage, hp: r.hp, mine: r.mine, place: r.place, members: r.members, mvp: r.mvp };
}

/** Всё, что нужно buildRecap о неделе week пользователя (в поясе tz). */
export async function loadRecapInput(userId: string, week: string, tz: string): Promise<RecapInput> {
  const { start, end } = bounds(week, tz);
  const prev = bounds(addWeeks(week, -1), tz);
  const [workouts, prevWorkouts, user, cover, achievements, league, percentile, muscles, calendar, bossWeek, bossHit, raid, weekBests] = await Promise.all([
    weekWorkouts(userId, start, end),
    weekWorkouts(userId, prev.start, prev.end),
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { currentStreak: true, lastStreakWeek: true, streakFreezes: true, weekWorkouts: true, weekWorkoutsKey: true, freezeGrantedAt: true },
    }),
    db.streakCoverWeek.findUnique({ where: { userId_week: { userId, week } }, select: { reason: true } }),
    db.userAchievement.findMany({
      where: { userId, earnedAt: { gte: start, lt: end }, NOT: { code: { startsWith: "login:" } } },
      select: { code: true, title: true },
      orderBy: { earnedAt: "asc" },
    }),
    leagueMembers(userId, start, end),
    weekPercentile(userId, start, end),
    muscleSets(userId, week, tz),
    getCalendar(userId, week, addDays(week, 6), tz, end),
    db.bossWeek.findUnique({ where: { userId_week: { userId, week } } }),
    weekDamage(db, userId, week, tz),
    weekRaid(userId, start, end),
    // 8 недель по неделю итогов: окна тренда силы (флаг strength_analytics владельца итогов)
    isEnabled("strength_analytics", userId).then((on) => (on ? exerciseWeekBests(userId, tz, bounds(addWeeks(week, -7), tz).start) : [])),
  ]);

  const ids = workouts.map((w) => w.id);
  const [sets, events] = await Promise.all([
    db.workoutSet.findMany({
      where: { workoutExercise: { workoutId: { in: ids } }, isWarmup: false, completedAt: { not: null } },
      select: { weight: true, reps: true, workoutExercise: { select: { exercise: { select: { id: true, name: true, isBodyweight: true } } } } },
    }),
    db.xpEvent.findMany({ where: { workoutId: { in: ids }, reason: XpReason.WORKOUT_COMPLETED }, select: { workoutId: true, meta: true } }),
  ]);
  // meta — в порядке тренировок недели
  const metaByWorkout = new Map(events.map((e) => [e.workoutId, e.meta as FinishMeta | null]));
  const finishMetas = ids.map((id) => metaByWorkout.get(id)).filter((m): m is FinishMeta => !!m);

  const totals = (w: { durationSec: number | null; totalVolume: number; totalSets: number }) => ({
    minutes: Math.round((w.durationSec ?? 0) / 60),
    volume: w.totalVolume,
    sets: w.totalSets,
  });
  const occurrences = calendar.occurrences;

  return {
    week,
    workouts: workouts.map((w) => ({ ...totals(w), finishedAt: w.finishedAt! })),
    prevWorkouts: prevWorkouts.map(totals),
    strengthWeeks: weekBests.filter((b) => b.week <= week),
    sets: sets.map((s) => ({
      exerciseId: s.workoutExercise.exercise.id,
      exerciseName: s.workoutExercise.exercise.name,
      isBodyweight: s.workoutExercise.exercise.isBodyweight,
      weight: s.weight,
      reps: s.reps,
    })),
    league,
    percentile: { value: percentile.percentile, xp: percentile.myXp },
    finishMetas,
    coveredByFreeze: cover?.reason === StreakCoverReason.FREEZE,
    // Серия на конец недели (момент перед следующим понедельником) — как её показывает дашборд
    streakAtWeekEnd: streakValue(streakStatus(user, new Date(end.getTime() - 1), tz)),
    achievements,
    muscleSets: muscles,
    boss: bossWeek
      ? { code: bossWeek.bossCode, hp: bossWeek.hp, damage: bossHit.damage, defeatedAt: bossWeek.defeatedAt?.toISOString() ?? null }
      : null,
    raid,
    plan: occurrences.length ? { done: occurrences.filter((o) => o.status === "done").length, planned: occurrences.length } : null,
  };
}

/** Создаёт снимок итогов недели (без проверки окна — для тика). true — строка создана сейчас. */
export async function createRecap(userId: string, week: string, tz: string): Promise<boolean> {
  // Дешёвая проверка до тяжёлого сбора (процентиль, лига, календарь): пустая неделя — итогов нет
  const { start, end } = bounds(week, tz);
  const any = await db.workout.findFirst({ where: { userId, status: WorkoutStatus.COMPLETED, finishedAt: { gte: start, lt: end } }, select: { id: true } });
  if (!any) return false;
  const data = buildRecap(await loadRecapInput(userId, week, tz));
  if (!data) return false;
  const { count } = await db.weeklyRecap.createMany({ data: [{ userId, week, data }], skipDuplicates: true });
  // Место в лиге за неделю появляется только в снимке — сразу выдаём ачивки лиги
  if (count === 1 && data.league && "place" in data.league) await evaluateAchievementsNow(userId);
  return count === 1;
}

export async function getRecap(userId: string, week: string): Promise<WeeklyRecapRow | null> {
  const row = await db.weeklyRecap.findUnique({ where: { userId_week: { userId, week } }, select: recapSelect });
  return row ? toRow(row) : null;
}

/** Снимок недели; если его нет, неделя закончилась (и не слишком старая), а тренировки были — создаёт на лету, без push. */
export async function getOrCreateRecap(userId: string, week: string, tz: string, now = new Date()): Promise<WeeklyRecapRow | null> {
  const existing = await getRecap(userId, week);
  if (existing || isRecapWeek(week, now, tz) !== "ok") return existing;
  await createRecap(userId, week, tz);
  return getRecap(userId, week);
}

export const RECAPS_PAGE = 20;

export async function listRecaps(userId: string, page: number): Promise<{ items: WeeklyRecapRow[]; hasMore: boolean }> {
  const rows = await db.weeklyRecap.findMany({
    where: { userId },
    select: recapSelect,
    orderBy: { week: "desc" },
    skip: (Math.max(1, page) - 1) * RECAPS_PAGE,
    take: RECAPS_PAGE + 1,
  });
  return { items: rows.slice(0, RECAPS_PAGE).map(toRow), hasMore: rows.length > RECAPS_PAGE };
}

export async function adjacentRecaps(userId: string, week: string): Promise<{ prev: string | null; next: string | null }> {
  const [prev, next] = await Promise.all([
    db.weeklyRecap.findFirst({ where: { userId, week: { lt: week } }, orderBy: { week: "desc" }, select: { week: true } }),
    db.weeklyRecap.findFirst({ where: { userId, week: { gt: week } }, orderBy: { week: "asc" }, select: { week: true } }),
  ]);
  return { prev: prev?.week ?? null, next: next?.week ?? null };
}

export async function markRecapSeen(userId: string, week: string): Promise<void> {
  await db.weeklyRecap.updateMany({ where: { userId, week, seenAt: null }, data: { seenAt: new Date() } });
}

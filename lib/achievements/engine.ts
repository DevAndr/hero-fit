import "server-only";
import { coachStats } from "@/lib/achievements/coach-stats";
import { bossWins } from "@/lib/boss/queries";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, RecordType, XpReason, type MuscleGroup } from "@/generated/prisma/enums";
import {
  EARLY_HOUR,
  earnedAchievements,
  EXPRESS,
  LATE_HOUR,
  LIFTS,
  type AchievementDef,
  type AchievementStats,
  type ExerciseStats,
  type LeaguePlace,
  type LiftKey,
} from "@/lib/achievements/definitions";
import { safeTimeZone } from "@/lib/daily-login";
import { nutritionStats } from "@/lib/nutrition/achievement-stats";
import { db } from "@/lib/db";
import { notifyMany } from "@/lib/notifications/service";
import { levelProgress } from "@/lib/progress/level";
import { achievementCoins, levelUpGrants, type CoinGrant } from "@/lib/shop/coins";
import { grantCoinsDetailed } from "@/lib/shop/coins-db";
import { MAX_REWARD_FREEZES, weekKey } from "@/lib/progress/weekly-streak";

type Client = Prisma.TransactionClient;

export type NewAchievement = { code: string; title: string; description: string; xpReward: number };

/** Статистика по упражнениям из истории: базовый вес (первая тренировка), лучший вес, макс. подходов. */
async function exerciseStats(client: Client, userId: string): Promise<ExerciseStats[]> {
  const rows = await client.$queryRaw<
    { id: string; name: string; baseline: number | null; best: number | null; maxSets: number }[]
  >`
    WITH per_workout AS (
      SELECT we."exerciseId" AS id, w.id AS wid, w."finishedAt" AS at,
             MAX(s.weight) AS top, COUNT(*)::int AS sets
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      JOIN "Exercise" ex ON ex.id = we."exerciseId"
      WHERE w."userId" = ${userId}
        AND w.status = 'COMPLETED'
        AND ex.kind <> 'STRETCH' -- удержания растяжки — не подходы для «Сет-героя»
        AND s."isWarmup" = false
        AND s."completedAt" IS NOT NULL
        AND (s.reps > 0 OR s."durationSec" > 0) -- подходы на время и кардио тоже в счёт («Сет-герой»)
      GROUP BY we."exerciseId", w.id, w."finishedAt"
    )
    SELECT p.id, e.name,
           (ARRAY_AGG(p.top ORDER BY p.at))[1] AS baseline,
           MAX(p.top) AS best,
           MAX(p.sets)::int AS "maxSets"
    FROM per_workout p
    JOIN "Exercise" e ON e.id = p.id
    GROUP BY p.id, e.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseline: r.baseline ?? 0,
    best: r.best ?? 0,
    maxSetsInWorkout: r.maxSets,
  }));
}

type Totals = {
  workouts: number;
  volume: number;
  maxVolume: number;
  reps: number;
  sec: number;
  longest: number;
  express: number;
  early: number;
  late: number;
  maxGapDays: number;
};

type Endurance = Pick<AchievementStats, "cardioDistanceM" | "workSec" | "longestCardioSetM" | "longestTimeSetSec" | "hybridWorkouts">;

/** Выносливость: подходы на время и кардио в завершённых тренировках; гибрид — силовой и кардио-подход в одной тренировке. */
async function enduranceStats(client: Client, userId: string): Promise<Endurance> {
  const [row] = await client.$queryRaw<Endurance[]>`
    WITH s AS (
      SELECT w.id AS wid, e.kind, s.reps, s."durationSec", s."distanceM"
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Exercise" e ON e.id = we."exerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND s."completedAt" IS NOT NULL AND NOT s."isWarmup"
    ),
    hybrid AS (
      SELECT wid FROM s GROUP BY wid
      HAVING bool_or(kind = 'REPS' AND reps > 0) AND bool_or(kind = 'CARDIO' AND "durationSec" > 0)
    )
    SELECT COALESCE(SUM("distanceM") FILTER (WHERE kind = 'CARDIO'), 0)::int AS "cardioDistanceM",
           COALESCE(SUM("durationSec") FILTER (WHERE kind IN ('TIME', 'CARDIO')), 0)::int AS "workSec",
           COALESCE(MAX("distanceM") FILTER (WHERE kind = 'CARDIO'), 0)::int AS "longestCardioSetM",
           COALESCE(MAX("durationSec") FILTER (WHERE kind = 'TIME'), 0)::int AS "longestTimeSetSec",
           (SELECT COUNT(*) FROM hybrid)::int AS "hybridWorkouts"
    FROM s
  `;
  return row;
}

/** Агрегаты по завершённым тренировкам; время суток — в поясе пользователя (колонки хранят UTC). */
async function workoutTotals(client: Client, userId: string, tz: string): Promise<Totals> {
  const [row] = await client.$queryRaw<Totals[]>`
    WITH w AS (
      SELECT "totalVolume", "totalReps", "totalSets", "durationSec",
             EXTRACT(HOUR FROM ("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS hour,
             EXTRACT(EPOCH FROM "finishedAt" - LAG("finishedAt") OVER (ORDER BY "finishedAt")) / 86400 AS gap
      FROM "Workout"
      WHERE "userId" = ${userId} AND status = 'COMPLETED' AND NOT "stretchOnly" -- сессия растяжки — не тренировка
    )
    SELECT COUNT(*)::int AS workouts,
           COALESCE(SUM("totalVolume"), 0)::float AS volume,
           COALESCE(MAX("totalVolume"), 0)::float AS "maxVolume",
           COALESCE(SUM("totalReps"), 0)::int AS reps,
           COALESCE(SUM("durationSec"), 0)::int AS sec,
           COALESCE(MAX("durationSec"), 0)::int AS longest,
           COUNT(*) FILTER (WHERE "durationSec" <= ${EXPRESS.maxSec} AND "totalSets" >= ${EXPRESS.minSets})::int AS express,
           COUNT(*) FILTER (WHERE hour < ${EARLY_HOUR})::int AS early,
           COUNT(*) FILTER (WHERE hour >= ${LATE_HOUR})::int AS late,
           COALESCE(MAX(gap), 0)::float AS "maxGapDays"
    FROM w
  `;
  return row;
}

/** Календарные недели (с понедельника, в поясе пользователя): сколько групп мышц за неделю. */
async function weekStats(client: Client, userId: string, tz: string) {
  const [rows, [{ currentWeek }]] = await Promise.all([
    client.$queryRaw<{ week: string; workouts: number; groups: number }[]>`
      WITH w AS (
        SELECT id, date_trunc('week', ("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}) AS week
        FROM "Workout"
        WHERE "userId" = ${userId} AND status = 'COMPLETED' AND NOT "stretchOnly"
      )
      SELECT to_char(w.week, 'YYYY-MM-DD') AS week,
             COUNT(DISTINCT w.id)::int AS workouts,
             COUNT(DISTINCT e."muscleGroups"[1])::int AS groups
      FROM w
      JOIN "WorkoutExercise" we ON we."workoutId" = w.id
      JOIN "Exercise" e ON e.id = we."exerciseId" AND e.kind <> 'STRETCH'
      GROUP BY w.week
    `,
    client.$queryRaw<{ currentWeek: string }[]>`
      SELECT to_char(date_trunc('week', now() AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS "currentWeek"
    `,
  ]);
  return {
    maxGroupsInWeek: Math.max(0, ...rows.map((r) => r.groups)),
    groupsThisWeek: rows.find((r) => r.week === currentWeek)?.groups ?? 0,
  };
}

/** Число тренировок на каждую основную группу мышц и число разных упражнений. */
async function varietyStats(client: Client, userId: string) {
  const [groups, [distinct]] = await Promise.all([
    client.$queryRaw<{ group: MuscleGroup; workouts: number }[]>`
      SELECT e."muscleGroups"[1]::text AS "group", COUNT(DISTINCT w.id)::int AS workouts
      FROM "Workout" w
      JOIN "WorkoutExercise" we ON we."workoutId" = w.id
      JOIN "Exercise" e ON e.id = we."exerciseId" AND e.kind <> 'STRETCH'
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND NOT w."stretchOnly" AND cardinality(e."muscleGroups") > 0
      GROUP BY 1
    `,
    client.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT we."exerciseId")::int AS n
      FROM "Workout" w
      JOIN "WorkoutExercise" we ON we."workoutId" = w.id
      JOIN "Exercise" e ON e.id = we."exerciseId" AND e.kind <> 'STRETCH' -- растяжка — не разнообразие упражнений
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND NOT w."stretchOnly"
    `,
  ]);
  return {
    muscleWorkouts: Object.fromEntries(groups.map((g) => [g.group, g.workouts])) as Partial<Record<MuscleGroup, number>>,
    distinctExercises: distinct.n,
  };
}

/** Побитые рекорды — из журнала XP (meta каждой тренировки), спасённые заморозкой недели — из StreakCoverWeek. */
async function journalStats(client: Client, userId: string) {
  const [row] = await client.$queryRaw<{ prCount: number; maxPrs: number; freezeSaves: number }[]>`
    SELECT COALESCE(SUM(jsonb_array_length(meta->'records')) FILTER (WHERE reason = 'PERSONAL_RECORD'), 0)::int AS "prCount",
           COALESCE(MAX(jsonb_array_length(meta->'records')) FILTER (WHERE reason = 'PERSONAL_RECORD'), 0)::int AS "maxPrs",
           (SELECT COUNT(*) FROM "StreakCoverWeek" c WHERE c."userId" = ${userId} AND c.reason = 'FREEZE')::int AS "freezeSaves"
    FROM "XpEvent"
    WHERE "userId" = ${userId} AND reason IN ('PERSONAL_RECORD', 'WORKOUT_COMPLETED', 'STRETCH_SESSION')
  `;
  return row;
}

/**
 * Места в лиге друзей по итогам недель — из снимков WeeklyRecap (лига там уже посчитана на конец недели).
 * Место засчитывается, только если в лиге было не меньше max(2, место) участников; демо-снимки сида не считаются.
 */
async function leagueStats(client: Client, userId: string): Promise<AchievementStats["leaguePlaces"]> {
  const rows = await client.$queryRaw<{ place: number; weeks: number }[]>`
    SELECT (data->'league'->>'place')::int AS place, COUNT(*)::int AS weeks
    FROM "WeeklyRecap"
    WHERE "userId" = ${userId} AND data->'league' ? 'place'
      AND (data->'league'->>'place')::int <= 3
      AND (data->'league'->>'of')::int >= GREATEST(2, (data->'league'->>'place')::int)
      AND (data->'league'->>'xp')::int > 0
      AND NOT COALESCE((data->>'demo')::boolean, false)
    GROUP BY 1
  `;
  const places: AchievementStats["leaguePlaces"] = { 1: 0, 2: 0, 3: 0 };
  for (const r of rows) places[r.place as LeaguePlace] = r.weeks;
  return places;
}

/** Тренировки по готовым программам (встроенные шаблоны с program). */
function programStats(client: Client, userId: string) {
  return client.$queryRaw<{ program: string; workouts: number }[]>`
    SELECT t.program, COUNT(*)::int AS workouts
    FROM "Workout" w
    JOIN "WorkoutTemplate" t ON t.id = w."templateId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND NOT w."stretchOnly" AND t."userId" IS NULL AND t.program IS NOT NULL
    GROUP BY t.program
  `;
}

/** Рекорды в базовых упражнениях: макс. вес и расчётный 1RM. */
async function liftStats(client: Client, userId: string): Promise<AchievementStats["lifts"]> {
  const byName = new Map(Object.entries(LIFTS).map(([key, l]) => [l.exercise, key as LiftKey]));
  const records = await client.personalRecord.findMany({
    where: {
      userId,
      type: { in: [RecordType.MAX_WEIGHT, RecordType.ONE_RM] },
      exercise: { userId: null, name: { in: [...byName.keys()] } },
    },
    select: { type: true, value: true, exercise: { select: { name: true } } },
  });
  const lifts: AchievementStats["lifts"] = {};
  for (const r of records) {
    const lift = (lifts[byName.get(r.exercise.name)!] ??= { maxWeight: 0, oneRm: 0 });
    if (r.type === RecordType.MAX_WEIGHT) lift.maxWeight = r.value;
    else lift.oneRm = r.value;
  }
  return lifts;
}

/** `coach: false` — без статистики тренера (лестницы COACH растут от тренировок клиентов, не от своих). */
export async function getAchievementStats(client: Client, userId: string, opts: { coach?: boolean } = {}): Promise<AchievementStats> {
  const { timeZone, ...user } = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      longestStreak: true,
      currentStreak: true,
      loginStreak: true,
      level: true,
      bodyWeight: true,
      timeZone: true,
      weekWorkouts: true,
      weekWorkoutsKey: true,
      isCoach: true,
    },
  });
  const tz = safeTimeZone(timeZone);
  const { weekWorkouts, weekWorkoutsKey, isCoach, ...rest } = user;
  const [exercises, totals, weeks, variety, journal, programs, lifts, customExercises, customTemplates, achievements, leaguePlaces, wins, goblinCatches, raidWins, raidMvps, goalsAchieved, clubTaskRewards, respectsReceived, togetherBonuses, coach, endurance] =
    await Promise.all([
      exerciseStats(client, userId),
      workoutTotals(client, userId, tz),
      weekStats(client, userId, tz),
      varietyStats(client, userId),
      journalStats(client, userId),
      programStats(client, userId),
      liftStats(client, userId),
      client.exercise.count({ where: { userId } }), // вместе с архивными: ачивка за сам факт создания
      client.workoutTemplate.count({ where: { userId } }),
      client.userAchievement.count({ where: { userId } }),
      leagueStats(client, userId),
      bossWins(client, userId),
      client.goblinEncounter.count({ where: { userId, caughtAt: { not: null } } }),
      client.raidReward.count({ where: { userId } }),
      client.raidWeek.count({ where: { mvpUserId: userId } }),
      client.goal.count({ where: { userId, status: "ACHIEVED" } }),
      client.clubTaskReward.count({ where: { userId } }),
      client.recordRespect.count({ where: { workout: { userId } } }),
      client.xpEvent.count({ where: { userId, reason: "TOGETHER_BONUS" } }),
      coachStats(client, userId, isCoach && opts.coach !== false),
      enduranceStats(client, userId),
    ]);
  const nutrition = await nutritionStats(client, userId, tz);
  return {
    ...rest,
    weekWorkouts: weekWorkoutsKey === weekKey(new Date(), tz) ? weekWorkouts : 0,
    leaguePlaces,
    bossWins: wins,
    goblinCatches,
    ...endurance,
    raidWins,
    raidMvps,
    goalsAchieved,
    clubTaskRewards,
    respectsReceived,
    togetherBonuses,
    coach,
    coachMode: isCoach,
    nutrition,
    workouts: totals.workouts,
    exercises,
    achievements,
    totalVolumeKg: totals.volume,
    maxWorkoutVolumeKg: totals.maxVolume,
    totalReps: totals.reps,
    prCount: journal.prCount,
    maxPrsInWorkout: journal.maxPrs,
    lifts,
    customExercises,
    customTemplates,
    totalSec: totals.sec,
    longestWorkoutSec: totals.longest,
    expressWorkouts: totals.express,
    earlyWorkouts: totals.early,
    lateWorkouts: totals.late,
    maxGapDays: totals.maxGapDays,
    freezeSaves: journal.freezeSaves,
    programs,
    ...weeks,
    ...variety,
  };
}

/** Сколько раз подряд перепроверять: выданные ачивки двигают уровень и «Коллекционера». */
const MAX_ROUNDS = 5;

/**
 * Выдаёт все ачивки, которых пользователь достиг, но ещё не получил, и начисляет за них XP.
 * Идемпотентно: unique(userId, code) + skipDuplicates.
 *
 * Статистика собирается один раз: выдача меняет только уровень (XP) и число ачивок —
 * их обновляем в памяти и перепроверяем правила без новых запросов.
 */
export async function evaluateAchievements(
  client: Client,
  userId: string,
  opts: { coach?: boolean } = {},
): Promise<{ achievements: NewAchievement[]; xp: number; coins: CoinGrant[] }> {
  const [stats, owned] = await Promise.all([
    getAchievementStats(client, userId, opts),
    client.userAchievement.findMany({ where: { userId }, select: { code: true } }),
  ]);
  const have = new Set(owned.map((a) => a.code));
  const total: { achievements: NewAchievement[]; xp: number; coins: CoinGrant[] } = { achievements: [], xp: 0, coins: [] };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const fresh = earnedAchievements(stats).filter((a) => !have.has(a.code));
    if (fresh.length === 0) break;
    const granted = await grant(client, userId, fresh);
    if (!granted) break;
    for (const a of fresh) have.add(a.code);
    stats.achievements += fresh.length;
    stats.level = granted.level;
    total.achievements.push(...fresh.map(({ code, title, description, xpReward }) => ({ code, title, description, xpReward })));
    total.xp += granted.xp;
    total.coins.push(...granted.coins);
  }
  return total;
}

/** В отдельной транзакции — для действий вне завершения тренировки (своё упражнение, шаблон, вес тела). */
export function evaluateAchievementsNow(userId: string) {
  return db.$transaction((tx) => evaluateAchievements(tx, userId), { timeout: 15_000 });
}

async function grant(client: Client, userId: string, fresh: AchievementDef[]): Promise<{ xp: number; level: number; coins: CoinGrant[] } | null> {
  const { count } = await client.userAchievement.createMany({
    // Явный список полей: freezeReward — правило выдачи, в БД его нет
    data: fresh.map(({ code, category, title, description, threshold, exerciseId, xpReward }) => ({
      userId,
      code,
      category,
      title,
      description,
      threshold,
      exerciseId,
      xpReward,
    })),
    skipDuplicates: true,
  });
  // Параллельный запрос мог успеть выдать часть — тогда XP не начисляем, чтобы не задвоить.
  if (count !== fresh.length) return null;

  const prefs = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyAchievements: true } });
  await notifyMany(
    client,
    userId,
    fresh.map((a) => ({
      type: NotificationType.ACHIEVEMENT,
      title: `🏆 ${a.title}`,
      body: `${a.description} · +${a.xpReward} XP`,
      url: "/achievements",
    })),
    { push: prefs.notifyAchievements },
  );

  const xp = fresh.reduce((sum, a) => sum + a.xpReward, 0);
  await client.xpEvent.create({
    data: { userId, amount: xp, reason: XpReason.ACHIEVEMENT, meta: { codes: fresh.map((a) => a.code) } },
  });
  const user = await client.user.update({ where: { id: userId }, data: { xp: { increment: xp } }, select: { xp: true } });
  const { level } = levelProgress(user.xp);
  // Монеты: за каждую ачивку и за уровни, которые принёс её XP (ключи делают повтор безопасным)
  const coins = await grantCoinsDetailed(client, userId, [
    ...fresh.map((a) => ({ reason: "ACHIEVEMENT" as const, key: `ach:${a.code}`, amount: achievementCoins(a.xpReward), meta: { title: a.title }, label: `Ачивка: ${a.title}` })),
    ...levelUpGrants(user.xp - xp, user.xp),
  ]);
  // Заморозки-награды копятся сверх еженедельного лимита, но не больше MAX_REWARD_FREEZES
  const freezes = fresh.reduce((sum, a) => sum + (a.freezeReward ?? 0), 0);
  const current = freezes
    ? (await client.user.findUniqueOrThrow({ where: { id: userId }, select: { streakFreezes: true } })).streakFreezes
    : 0;
  await client.user.update({
    where: { id: userId },
    data: { level, ...(freezes ? { streakFreezes: Math.min(MAX_REWARD_FREEZES, current + freezes) } : {}) },
  });
  return { xp, level, coins };
}

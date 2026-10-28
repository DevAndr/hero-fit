import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { WorkoutStatus, type MuscleGroup, type RecordType, type StretchZone } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { weekStart } from "@/lib/dates";
import { db } from "@/lib/db";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { progressionHint, type ProgressionHint } from "@/lib/progress/progression";
import { bestOfSets, epley1RM, LOWER_IS_BETTER } from "@/lib/progress/records";
import { topZones } from "@/lib/stats/stretch";
import { REP_RANGES, type RepRangeRow } from "@/lib/stats/ranges";
import {
  activityGrid,
  rhythm,
  strengthSeries,
  weeklySeries,
  type DayRow,
  type StrengthRow,
} from "@/lib/stats/series";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Счётчики и время в зале. Границы «сегодня» и «с начала года» — в поясе пользователя. */
async function totals(userId: string, timeZone: string) {
  const [row] = await db.$queryRaw<
    {
      total: number;
      week: number;
      month: number;
      secToday: number;
      secWeek: number;
      secYear: number;
      secAll: number;
      volume: number;
      exercises: number;
    }[]
  >`
    WITH w AS (
      SELECT id, "durationSec" AS d, "totalVolume" AS v,
             ("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone} AS local
      FROM "Workout"
      WHERE "userId" = ${userId} AND status = 'COMPLETED' AND NOT "stretchOnly"
    ), n AS (SELECT now() AT TIME ZONE ${timeZone} AS local_now)
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE w.local >= n.local_now - interval '7 days')::int AS week,
           COUNT(*) FILTER (WHERE w.local >= n.local_now - interval '30 days')::int AS month,
           COALESCE(SUM(d) FILTER (WHERE w.local::date = n.local_now::date), 0)::int AS "secToday",
           COALESCE(SUM(d) FILTER (WHERE w.local >= n.local_now - interval '7 days'), 0)::int AS "secWeek",
           COALESCE(SUM(d) FILTER (WHERE date_trunc('year', w.local) = date_trunc('year', n.local_now)), 0)::int AS "secYear",
           COALESCE(SUM(d), 0)::int AS "secAll",
           COALESCE(SUM(v), 0)::float8 AS volume,
           (SELECT COUNT(*) FROM "WorkoutExercise" we WHERE we."workoutId" IN (SELECT id FROM w))::int AS exercises
    FROM w, n
  `;
  return row;
}

export type MuscleRow = { group: MuscleGroup; week: number; month: number; all: number };

/** Сколько упражнений сделано на каждую группу мышц (по основной группе упражнения). */
async function muscleGroups(userId: string): Promise<MuscleRow[]> {
  const now = Date.now();
  const rows = await db.$queryRaw<{ group: MuscleGroup; week: number; month: number; all: number }[]>`
    SELECT e."muscleGroups"[1]::text AS "group",
           COUNT(*) FILTER (WHERE w."finishedAt" >= ${new Date(now - 7 * DAY_MS)})::int AS week,
           COUNT(*) FILTER (WHERE w."finishedAt" >= ${new Date(now - 30 * DAY_MS)})::int AS month,
           COUNT(*)::int AS "all"
    FROM "WorkoutExercise" we
    JOIN "Workout" w ON w.id = we."workoutId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED'
    GROUP BY 1
  `;
  const byGroup = new Map(rows.map((r) => [r.group, r]));
  return MUSCLE_GROUPS.map((group) => byGroup.get(group) ?? { group, week: 0, month: 0, all: 0 });
}

async function trainedExercises(userId: string) {
  const [rows, records] = await Promise.all([
    db.$queryRaw<{ id: string; name: string; muscleGroups: MuscleGroup[]; sessions: number; last: Date }[]>`
      SELECT e.id, e.name, e."muscleGroups"::text[] AS "muscleGroups",
             COUNT(DISTINCT w.id)::int AS sessions, MAX(w."finishedAt") AS last
      FROM "WorkoutExercise" we
      JOIN "Workout" w ON w.id = we."workoutId"
      JOIN "Exercise" e ON e.id = we."exerciseId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED'
      GROUP BY e.id
      ORDER BY last DESC
    `,
    db.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, type: true, value: true } }),
  ]);
  return rows.map((r) => ({
    ...r,
    records: Object.fromEntries(
      records.filter((rec) => rec.exerciseId === r.id).map((rec) => [rec.type, rec.value]),
    ) as Partial<Record<RecordType, number>>,
  }));
}

async function history(userId: string) {
  return db.workout.findMany({
    where: { userId, status: WorkoutStatus.COMPLETED, stretchOnly: false },
    orderBy: { finishedAt: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      finishedAt: true,
      durationSec: true,
      totalVolume: true,
      totalSets: true,
      totalReps: true,
      rpe: true,
      exercises: { select: { exercise: { select: { muscleGroups: true } } } },
    },
  });
}

export async function getStats(userId: string, timeZone: string) {
  const [t, muscles, exercises, workouts] = await Promise.all([
    totals(userId, timeZone),
    muscleGroups(userId),
    trainedExercises(userId),
    history(userId),
  ]);
  return { totals: t, muscles, exercises, workouts };
}

// ───────────────────────────── Прогресс по упражнению ─────────────────────────────

export type ExerciseSession = {
  workoutId: string;
  date: string;
  sets: { weight: number; reps: number; rir: number | null; durationSec: number | null; distanceM: number | null }[];
  topWeight: number;
  best1RM: number;
  volume: number;
  reps: number;
};

export async function getExerciseProgress(userId: string, exerciseId: string) {
  const exercise = await db.exercise.findFirst({
    where: { id: exerciseId, OR: [{ userId: null }, { userId }] },
    select: { id: true, name: true, muscleGroups: true, isBodyweight: true, kind: true },
  });
  if (!exercise) return null;

  const rows = await db.workoutExercise.findMany({
      where: { exerciseId, workout: { userId, status: WorkoutStatus.COMPLETED } },
      orderBy: [{ workout: { finishedAt: "asc" } }, { order: "asc" }],
      select: {
        workout: { select: { id: true, finishedAt: true } },
        sets: {
          where: { isWarmup: false, completedAt: { not: null } },
          orderBy: { order: "asc" },
          select: { weight: true, reps: true, rir: true, durationSec: true, distanceM: true },
        },
      },
    });

  // Одно упражнение могло встретиться в тренировке дважды — объединяем по тренировке.
  const byWorkout = new Map<string, ExerciseSession>();
  for (const row of rows) {
    const s = byWorkout.get(row.workout.id) ?? {
      workoutId: row.workout.id,
      date: row.workout.finishedAt?.toISOString() ?? "",
      sets: [],
      topWeight: 0,
      best1RM: 0,
      volume: 0,
      reps: 0,
    };
    for (const set of row.sets) {
      s.sets.push(set);
      s.topWeight = Math.max(s.topWeight, set.weight);
      s.best1RM = Math.max(s.best1RM, epley1RM(set.weight, set.reps));
      s.volume += set.weight * set.reps;
      s.reps += set.reps;
    }
    byWorkout.set(row.workout.id, s);
  }
  const sessions = [...byWorkout.values()].filter((s) => s.sets.length > 0);

  // Рекорды считаем по истории — тот же источник, что и у графика.
  const records: { type: RecordType; value: number; achievedAt: Date }[] = [];
  for (const session of sessions) {
    for (const [type, value] of Object.entries(bestOfSets(session.sets, exercise.kind)) as [RecordType, number][]) {
      const current = records.find((r) => r.type === type);
      const better = current && (LOWER_IS_BETTER.has(type) ? value < current.value - 1e-9 : value > current.value + 1e-9);
      if (!current) records.push({ type, value, achievedAt: new Date(session.date) });
      else if (better) Object.assign(current, { value, achievedAt: new Date(session.date) });
    }
  }

  return { exercise, sessions, records, hint: exercise.kind === "REPS" ? progressionHint(sessions) : null };
}

/** Подсказки «Пора увеличить вес» для редактора тренировки: последние сессии по каждому упражнению. */
export async function getProgressionHints(userId: string, exerciseIds: string[]): Promise<Record<string, ProgressionHint>> {
  if (exerciseIds.length === 0) return {};
  const rows = await db.$queryRaw<{ exerciseId: string; workoutId: string; weight: number; reps: number; rir: number | null }[]>`
    WITH recent AS (
      SELECT we.id AS weid, we."exerciseId", w.id AS "workoutId", w."finishedAt",
             DENSE_RANK() OVER (PARTITION BY we."exerciseId" ORDER BY w."finishedAt" DESC, w.id) AS rnk
      FROM "WorkoutExercise" we
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND we."exerciseId" = ANY(${exerciseIds})
    )
    SELECT r."exerciseId", r."workoutId", s.weight, s.reps, s.rir
    FROM recent r
    JOIN "WorkoutSet" s ON s."workoutExerciseId" = r.weid
    WHERE r.rnk <= 3 AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0
    ORDER BY r."finishedAt" ASC, s."order" ASC
  `;
  const sessions = new Map<string, Map<string, { weight: number; reps: number; rir: number | null }[]>>();
  for (const r of rows) {
    const perExercise = sessions.get(r.exerciseId) ?? new Map();
    const sets = perExercise.get(r.workoutId) ?? [];
    sets.push({ weight: r.weight, reps: r.reps, rir: r.rir });
    perExercise.set(r.workoutId, sets);
    sessions.set(r.exerciseId, perExercise);
  }
  const hints: Record<string, ProgressionHint> = {};
  for (const [exerciseId, perWorkout] of sessions) {
    const hint = progressionHint([...perWorkout.values()].map((sets) => ({ sets })));
    if (hint) hints[exerciseId] = hint;
  }
  return hints;
}

// ───────────────────────────── Тренды и графики ─────────────────────────────

export const TREND_WEEKS = 12;
export const HEATMAP_WEEKS = 26;
const STRENGTH_SERIES = 3;

/** Итоги по дням (в поясе пользователя) за окно календаря активности; рекорды — из журнала XP. */
async function dailyRows(userId: string, timeZone: string, since: Date): Promise<DayRow[]> {
  return db.$queryRaw<DayRow[]>`
    WITH w AS (
      SELECT w.id, w."totalVolume", w."durationSec", w."totalSets",
             to_char((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             COALESCE((
               SELECT SUM(jsonb_array_length(x.meta->'records'))
               FROM "XpEvent" x WHERE x."workoutId" = w.id AND x.reason = 'PERSONAL_RECORD'
             ), 0) AS prs
      FROM "Workout" w
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
    )
    SELECT day,
           SUM("totalVolume")::float8 AS volume,
           COUNT(*)::int AS workouts,
           COALESCE(SUM("durationSec"), 0)::int AS sec,
           SUM("totalSets")::int AS sets,
           SUM(prs)::int AS prs
    FROM w
    GROUP BY day
  `;
}

/** Лучший расчётный 1RM (Эпли) по неделям для самых частых упражнений с весом. */
async function strengthRows(userId: string, timeZone: string, since: Date): Promise<StrengthRow[]> {
  return db.$queryRaw<StrengthRow[]>`
    WITH s AS (
      SELECT we."exerciseId",
             to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week,
             MAX(CASE WHEN s.reps = 1 THEN s.weight ELSE s.weight * (1 + s.reps / 30.0) END) AS "oneRm",
             COUNT(DISTINCT w.id) AS sessions
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
        AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0 AND s.weight > 0
      GROUP BY 1, 2
    ), top AS (
      SELECT "exerciseId", SUM(sessions) AS n, MAX(week) AS last
      FROM s GROUP BY 1
      ORDER BY n DESC, last DESC, "exerciseId"
      LIMIT ${STRENGTH_SERIES}
    )
    SELECT s."exerciseId", e.name, s.week, s."oneRm"::float8 AS "oneRm"
    FROM s
    JOIN top ON top."exerciseId" = s."exerciseId"
    JOIN "Exercise" e ON e.id = s."exerciseId"
    ORDER BY top.n DESC, top.last DESC, s."exerciseId", s.week
  `;
}

/** Когда тренируется пользователь: день недели и час начала (в его поясе), за всё время. */
async function rhythmRows(userId: string, timeZone: string) {
  const local = Prisma.sql`("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}`;
  return Promise.all([
    db.$queryRaw<{ dow: number; workouts: number }[]>`
      SELECT EXTRACT(ISODOW FROM ${local})::int AS dow, COUNT(*)::int AS workouts
      FROM "Workout" WHERE "userId" = ${userId} AND status = 'COMPLETED' AND NOT "stretchOnly" AND "startedAt" IS NOT NULL
      GROUP BY 1
    `,
    db.$queryRaw<{ hour: number; workouts: number }[]>`
      SELECT EXTRACT(HOUR FROM ${local})::int AS hour, COUNT(*)::int AS workouts
      FROM "Workout" WHERE "userId" = ${userId} AND status = 'COMPLETED' AND NOT "stretchOnly" AND "startedAt" IS NOT NULL
      GROUP BY 1
    `,
  ]);
}

/** Рабочие подходы с весом по диапазонам повторов: за 30 дней и за всё время. */
async function repRanges(userId: string): Promise<RepRangeRow[]> {
  const rows = await db.$queryRaw<RepRangeRow[]>`
    SELECT CASE WHEN s.reps <= 5 THEN 'strength' WHEN s.reps <= 12 THEN 'hypertrophy' ELSE 'endurance' END AS key,
           COUNT(*) FILTER (WHERE w."finishedAt" >= ${new Date(Date.now() - 30 * DAY_MS)})::int AS month,
           COUNT(*)::int AS "all"
    FROM "WorkoutSet" s
    JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
    JOIN "Workout" w ON w.id = we."workoutId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED'
      AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0 AND s.weight > 0
    GROUP BY 1
  `;
  return REP_RANGES.map(({ key }) => rows.find((r) => r.key === key) ?? { key, month: 0, all: 0 });
}

export async function getTrends(userId: string, timeZone: string) {
  const today = dayKey(new Date(), timeZone);
  // С запасом в день: границы недель считаются в поясе пользователя, лишнее отсекают чистые функции.
  const since = new Date(`${weekStart(today)}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 7 * (HEATMAP_WEEKS - 1) - 1);

  const [days, strength, [byWeekday, byHour], reps] = await Promise.all([
    dailyRows(userId, timeZone, since),
    strengthRows(userId, timeZone, since),
    rhythmRows(userId, timeZone),
    repRanges(userId),
  ]);
  const weekly = weeklySeries(days, today, TREND_WEEKS);
  return {
    weekly,
    activity: activityGrid(days, today, HEATMAP_WEEKS),
    strength: strengthSeries(strength, weeklySeries([], today, HEATMAP_WEEKS).map((w) => w.week)),
    rhythm: rhythm(byWeekday, byHour),
    repRanges: reps,
  };
}

export type Trends = Awaited<ReturnType<typeof getTrends>>;

/** Только календарь активности (дашборд v3) — без остальных запросов getTrends. */
export async function getActivity(userId: string, timeZone: string) {
  const today = dayKey(new Date(), timeZone);
  const since = new Date(`${weekStart(today)}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 7 * (HEATMAP_WEEKS - 1) - 1);
  return activityGrid(await dailyRows(userId, timeZone, since), today, HEATMAP_WEEKS);
}

export type CardioStats = { weekSec: number; weekM: number; monthSec: number; monthM: number };

/** Кардио и упражнения на время за 7 и 30 дней: минуты работы и километры (подходы завершённых тренировок). */
export async function getCardioStats(userId: string): Promise<CardioStats> {
  const now = Date.now();
  const week = new Date(now - 7 * 86_400_000);
  const month = new Date(now - 30 * 86_400_000);
  const [row] = await db.$queryRaw<CardioStats[]>`
    SELECT COALESCE(SUM(s."durationSec") FILTER (WHERE w."finishedAt" >= ${week}), 0)::int AS "weekSec",
           COALESCE(SUM(s."distanceM") FILTER (WHERE w."finishedAt" >= ${week} AND e.kind = 'CARDIO'), 0)::int AS "weekM",
           COALESCE(SUM(s."durationSec"), 0)::int AS "monthSec",
           COALESCE(SUM(s."distanceM") FILTER (WHERE e.kind = 'CARDIO'), 0)::int AS "monthM"
    FROM "WorkoutSet" s
    JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    JOIN "Workout" w ON w.id = we."workoutId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${month}
      AND e.kind IN ('TIME', 'CARDIO') AND s."completedAt" IS NOT NULL AND NOT s."isWarmup"
  `;
  return row;
}

export type StretchWindow = { minutes: number; sessions: number };
export type StretchStats = {
  week: StretchWindow;
  days7: StretchWindow;
  days30: StretchWindow;
  topZones: { zone: StretchZone; minutes: number }[];
  /** Растяжка в истории есть (даже если флаг выключен) — блок на /stats показываем. */
  hasHistory: boolean;
};

/**
 * Растяжка: сессия — тренировка с хотя бы одним выполненным подходом растяжки (и заминка в силовой),
 * минуты — сумма удержаний (у упражнений «на каждую сторону» ×2). Неделя — с понедельника в поясе пользователя.
 */
export async function getStretchStats(userId: string, timeZone: string): Promise<StretchStats> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY_MS);
  const [rows, [{ has }]] = await Promise.all([
    db.$queryRaw<{ workoutId: string; day: string; finishedAt: Date; zones: StretchZone[]; sec: number }[]>`
      SELECT w.id AS "workoutId", w."finishedAt",
             to_char((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
             e."stretchZones"::text[] AS zones,
             (SUM(s."durationSec") * CASE WHEN e."perSide" THEN 2 ELSE 1 END)::int AS sec
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Exercise" e ON e.id = we."exerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
        AND e.kind = 'STRETCH' AND s."completedAt" IS NOT NULL AND NOT s."isWarmup" AND s."durationSec" > 0
      GROUP BY w.id, we.id, e.id
    `,
    db.$queryRaw<{ has: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM "WorkoutExercise" we
        JOIN "Exercise" e ON e.id = we."exerciseId"
        JOIN "Workout" w ON w.id = we."workoutId"
        WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND e.kind = 'STRETCH'
      ) AS has
    `,
  ]);

  const monday = weekStart(dayKey(new Date(now), timeZone));
  const week7 = new Date(now - 7 * DAY_MS);
  const windows = { week: new Map<string, number>(), days7: new Map<string, number>(), days30: new Map<string, number>() };
  const add = (m: Map<string, number>, id: string, sec: number) => m.set(id, (m.get(id) ?? 0) + sec);
  for (const r of rows) {
    add(windows.days30, r.workoutId, r.sec);
    if (r.finishedAt >= week7) add(windows.days7, r.workoutId, r.sec);
    if (r.day >= monday) add(windows.week, r.workoutId, r.sec);
  }
  const win = (m: Map<string, number>): StretchWindow => ({
    minutes: Math.round([...m.values()].reduce((a, b) => a + b, 0) / 60),
    sessions: m.size,
  });
  return {
    week: win(windows.week),
    days7: win(windows.days7),
    days30: win(windows.days30),
    topZones: topZones(rows.map((r) => ({ zones: r.zones, sec: r.sec }))).map((z) => ({ ...z, minutes: Math.round(z.minutes) })),
    hasHistory: has,
  };
}

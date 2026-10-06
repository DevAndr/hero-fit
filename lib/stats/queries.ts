import "server-only";
import { WorkoutStatus, type MuscleGroup, type RecordType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { progressionHint, type ProgressionHint } from "@/lib/progress/progression";
import { bestOfSets, epley1RM } from "@/lib/progress/records";

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
      WHERE "userId" = ${userId} AND status = 'COMPLETED'
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
    where: { userId, status: WorkoutStatus.COMPLETED },
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
  sets: { weight: number; reps: number }[];
  topWeight: number;
  best1RM: number;
  volume: number;
  reps: number;
};

export async function getExerciseProgress(userId: string, exerciseId: string) {
  const exercise = await db.exercise.findFirst({
    where: { id: exerciseId, OR: [{ userId: null }, { userId }] },
    select: { id: true, name: true, muscleGroups: true, isBodyweight: true },
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
          select: { weight: true, reps: true },
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
    for (const [type, value] of Object.entries(bestOfSets(session.sets)) as [RecordType, number][]) {
      const current = records.find((r) => r.type === type);
      if (!current) records.push({ type, value, achievedAt: new Date(session.date) });
      else if (value > current.value + 1e-9) Object.assign(current, { value, achievedAt: new Date(session.date) });
    }
  }

  return { exercise, sessions, records, hint: progressionHint(sessions) };
}

/** Подсказки «Пора увеличить вес» для редактора тренировки: последние сессии по каждому упражнению. */
export async function getProgressionHints(userId: string, exerciseIds: string[]): Promise<Record<string, ProgressionHint>> {
  if (exerciseIds.length === 0) return {};
  const rows = await db.$queryRaw<{ exerciseId: string; workoutId: string; weight: number; reps: number }[]>`
    WITH recent AS (
      SELECT we.id AS weid, we."exerciseId", w.id AS "workoutId", w."finishedAt",
             DENSE_RANK() OVER (PARTITION BY we."exerciseId" ORDER BY w."finishedAt" DESC, w.id) AS rnk
      FROM "WorkoutExercise" we
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND we."exerciseId" = ANY(${exerciseIds})
    )
    SELECT r."exerciseId", r."workoutId", s.weight, s.reps
    FROM recent r
    JOIN "WorkoutSet" s ON s."workoutExerciseId" = r.weid
    WHERE r.rnk <= 3 AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0
    ORDER BY r."finishedAt" ASC, s."order" ASC
  `;
  const sessions = new Map<string, Map<string, { weight: number; reps: number }[]>>();
  for (const r of rows) {
    const perExercise = sessions.get(r.exerciseId) ?? new Map();
    const sets = perExercise.get(r.workoutId) ?? [];
    sets.push({ weight: r.weight, reps: r.reps });
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

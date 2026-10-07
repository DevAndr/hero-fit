import "dotenv/config";
import { randomUUID } from "node:crypto";
import pg, { Client } from "pg";

// Колонки — timestamp без зоны, в них UTC (так пишет Prisma). По умолчанию pg сериализует Date
// в локальном поясе процесса, и Postgres молча отбрасывает смещение — время уехало бы на UTC-offset.
pg.defaults.parseInputDatesAsUTC = true;

/** Прямой доступ к БД для подготовки истории в e2e (быстрее, чем прокликивать десятки тренировок). */
export async function withDb<T>(fn: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export async function userId(db: Client, login: string) {
  const { rows } = await db.query<{ id: string }>(`select id from "User" where login = $1`, [login]);
  return rows[0].id;
}

/** Завершённые тренировки с одним упражнением: по одной в день, начиная с `daysAgo` назад. */
export async function seedWorkouts(
  login: string,
  exerciseName: string,
  workouts: { weight: number; reps: number; sets: number }[],
  daysAgo = workouts.length + 1,
) {
  await withDb(async (db) => {
    const uid = await userId(db, login);
    const { rows } = await db.query<{ id: string }>(`select id from "Exercise" where name = $1 and "userId" is null`, [
      exerciseName,
    ]);
    const exerciseId = rows[0].id;
    for (const [i, w] of workouts.entries()) {
      const finished = new Date(Date.now() - (daysAgo - i) * 24 * 3600 * 1000);
      const started = new Date(finished.getTime() - 3600 * 1000);
      const workoutId = randomUUID();
      const weId = randomUUID();
      await db.query(
        `insert into "Workout" (id, "userId", name, status, "startedAt", "finishedAt", "durationSec", "totalVolume", "totalSets", "totalReps", "createdAt", "updatedAt")
         values ($1, $2, 'Seed', 'COMPLETED', $3, $4, 3600, $5, $6, $7, $3, $4)`,
        [workoutId, uid, started, finished, w.weight * w.reps * w.sets, w.sets, w.reps * w.sets],
      );
      await db.query(`insert into "WorkoutExercise" (id, "workoutId", "exerciseId", "order", "restSec") values ($1, $2, $3, 0, 90)`, [
        weId,
        workoutId,
        exerciseId,
      ]);
      for (let s = 0; s < w.sets; s++) {
        await db.query(
          `insert into "WorkoutSet" (id, "workoutExerciseId", "order", weight, reps, "isWarmup", "completedAt") values ($1, $2, $3, $4, $5, false, $6)`,
          [randomUUID(), weId, s, w.weight, w.reps, finished],
        );
      }
    }
  });
}

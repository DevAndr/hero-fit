import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { WeekBest } from "@/lib/stats/strength";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Лучшее по неделям (понедельник в поясе timeZone, по finishedAt) в каждом упражнении с since: рабочие выполненные
 * подходы завершённых тренировок. 1ПМ — Эпли только по подходам с весом и повторами ≤ 12 (на больших формула завышает).
 * exerciseIds — только эти упражнения (прогноз целей).
 */
export async function exerciseWeekBests(
  userId: string,
  timeZone: string,
  since: Date,
  exerciseIds?: string[],
  client: Client = db,
): Promise<WeekBest[]> {
  if (exerciseIds && exerciseIds.length === 0) return [];
  const only = exerciseIds ?? null;
  return client.$queryRaw<WeekBest[]>`
    SELECT we."exerciseId",
           e.name,
           e."isBodyweight" AS bodyweight,
           to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week,
           (MAX(CASE WHEN s.reps = 1 THEN s.weight ELSE s.weight * (1 + s.reps / 30.0) END)
              FILTER (WHERE s.weight > 0 AND s.reps <= 12))::float8 AS "oneRm",
           MAX(s.weight)::float8 AS "maxWeight",
           MAX(s.reps)::int AS "maxReps",
           COUNT(DISTINCT w.id)::int AS sessions
    FROM "WorkoutSet" s
    JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
    JOIN "Workout" w ON w.id = we."workoutId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
      AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0
      AND (${only}::text[] IS NULL OR we."exerciseId" = ANY(${only}::text[]))
    GROUP BY we."exerciseId", e.name, e."isBodyweight", 4
    ORDER BY we."exerciseId", week
  `;
}

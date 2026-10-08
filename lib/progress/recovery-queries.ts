import "server-only";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { muscleRecovery, RECOVERY_WINDOW_DAYS, type GroupRecovery } from "@/lib/progress/recovery";

/**
 * Восстановление групп мышц по завершённым тренировкам (`lib/progress/recovery.ts`).
 * Рабочие подходы (без разминки): основной группе упражнения — 1, второстепенным — 0,5.
 */
export async function getMuscleRecovery(userId: string, now = new Date()): Promise<GroupRecovery[]> {
  const since = new Date(now.getTime() - RECOVERY_WINDOW_DAYS * 24 * 3_600_000);
  const [recent, last] = await Promise.all([
    db.$queryRaw<{ group: MuscleGroup; sets: number; at: Date }[]>`
      SELECT g.grp::text AS "group", w."finishedAt" AS at,
             SUM(CASE WHEN g.ord = 1 THEN 1 ELSE 0.5 END)::float AS sets
      FROM "Workout" w
      JOIN "WorkoutExercise" we ON we."workoutId" = w.id
      JOIN "Exercise" e ON e.id = we."exerciseId"
      JOIN "WorkoutSet" s ON s."workoutExerciseId" = we.id AND NOT s."isWarmup"
      CROSS JOIN LATERAL unnest(e."muscleGroups") WITH ORDINALITY AS g(grp, ord)
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
      GROUP BY w.id, w."finishedAt", g.grp
    `,
    db.$queryRaw<{ group: MuscleGroup; at: Date }[]>`
      SELECT g.grp::text AS "group", MAX(w."finishedAt") AS at
      FROM "Workout" w
      JOIN "WorkoutExercise" we ON we."workoutId" = w.id
      JOIN "Exercise" e ON e.id = we."exerciseId"
      CROSS JOIN LATERAL unnest(e."muscleGroups") AS g(grp)
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" IS NOT NULL
        AND EXISTS (SELECT 1 FROM "WorkoutSet" s WHERE s."workoutExerciseId" = we.id AND NOT s."isWarmup")
      GROUP BY g.grp
    `,
  ]);
  return muscleRecovery(
    recent,
    last.map((r) => ({ ...r, sets: 1 })),
    now,
  );
}

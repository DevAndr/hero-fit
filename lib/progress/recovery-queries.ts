import "server-only";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { BALANCE_DAYS, muscleBalance } from "@/lib/progress/balance";
import { muscleRecovery, RECOVERY_WINDOW_DAYS, type GroupRecovery } from "@/lib/progress/recovery";
import { planRecoveryWorkout, type PlanCandidate } from "@/lib/progress/recovery-plan";

const DAY_MS = 24 * 3_600_000;
/** Сколько дней истории смотрим, выбирая «свои» упражнения для сборки по восстановлению. */
const HISTORY_DAYS = 90;

/**
 * Восстановление групп мышц по завершённым тренировкам (`lib/progress/recovery.ts`).
 * Рабочие подходы (без разминки): основной группе упражнения — 1, второстепенным — 0,5;
 * подход до отказа утомляет сильнее — RIR 0 ×1,5, RIR 1 ×1,25.
 */
export async function getMuscleRecovery(userId: string, now = new Date()): Promise<GroupRecovery[]> {
  const since = new Date(now.getTime() - RECOVERY_WINDOW_DAYS * DAY_MS);
  const [recent, last] = await Promise.all([
    db.$queryRaw<{ group: MuscleGroup; sets: number; at: Date }[]>`
      SELECT g.grp::text AS "group", w."finishedAt" AS at,
             SUM(CASE WHEN g.ord = 1 THEN 1 ELSE 0.5 END
                 * CASE s.rir WHEN 0 THEN 1.5 WHEN 1 THEN 1.25 ELSE 1 END)::float AS sets
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

/** Подходы на группу за `BALANCE_DAYS` дней (основная — 1, второстепенные — 0,5; RIR не влияет). */
export async function getMuscleBalance(userId: string, now = new Date()) {
  const rows = await db.$queryRaw<{ group: MuscleGroup; sets: number }[]>`
    SELECT g.grp::text AS "group", SUM(CASE WHEN g.ord = 1 THEN 1 ELSE 0.5 END)::float AS sets
    FROM "Workout" w
    JOIN "WorkoutExercise" we ON we."workoutId" = w.id
    JOIN "Exercise" e ON e.id = we."exerciseId"
    JOIN "WorkoutSet" s ON s."workoutExerciseId" = we.id AND NOT s."isWarmup"
    CROSS JOIN LATERAL unnest(e."muscleGroups") WITH ORDINALITY AS g(grp, ord)
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED'
      AND w."finishedAt" >= ${new Date(now.getTime() - BALANCE_DAYS * DAY_MS)}
    GROUP BY g.grp
  `;
  return muscleBalance(rows);
}

/**
 * Кандидаты для сборки по восстановлению: встроенные и свои неархивные упражнения;
 * `uses` — тренировок с ним за 90 дней, `order` — порядок справочника (встроенные создаются сидом по порядку).
 */
async function planCandidates(userId: string, now: Date) {
  return db.$queryRaw<PlanCandidate[]>`
    SELECT e.id, e.name, e."muscleGroups"::text[] AS "muscleGroups", e."defaultRestSec" AS "restSec",
           (SELECT COUNT(DISTINCT w.id) FROM "WorkoutExercise" we
              JOIN "Workout" w ON w.id = we."workoutId"
             WHERE we."exerciseId" = e.id AND w."userId" = ${userId} AND w.status = 'COMPLETED'
               AND w."finishedAt" >= ${new Date(now.getTime() - HISTORY_DAYS * DAY_MS)})::int AS uses,
           (ROW_NUMBER() OVER (ORDER BY e."createdAt", e.id))::int AS "order"
    FROM "Exercise" e
    WHERE e."archivedAt" IS NULL AND (e."userId" IS NULL OR e."userId" = ${userId})
  `;
}

/** Что соберёт «По восстановлению» сейчас (для карточки на экране старта и для самого старта). */
export async function getRecoveryPlan(userId: string, now = new Date()) {
  const [recovery, candidates] = await Promise.all([getMuscleRecovery(userId, now), planCandidates(userId, now)]);
  return planRecoveryWorkout(recovery, candidates);
}

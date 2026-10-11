import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { progressTarget, type ProgressionItem } from "@/lib/coach/progression";

type FinishedWorkout = {
  templateId: string | null;
  exercises: {
    exerciseId: string;
    exercise: { name: string; isBodyweight: boolean };
    sets: { weight: number; reps: number; isWarmup: boolean; completedAt: Date | null }[];
  }[];
};

/**
 * Своя прогрессия при завершении тренировки (в транзакции finishWorkout): шаблон — свой, строки с весом и шагом
 * (упражнение дважды — первая строка). Правило — то же, что у заданий тренера; меняются вес цели и неудачи строки.
 */
export async function applyOwnProgression(tx: Prisma.TransactionClient, userId: string, workout: FinishedWorkout): Promise<ProgressionItem[]> {
  if (!workout.templateId) return [];
  const rows = await tx.templateExercise.findMany({
    where: { templateId: workout.templateId, template: { userId }, targetWeight: { not: null }, step: { not: null } },
    orderBy: { order: "asc" },
  });
  const items: ProgressionItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.exerciseId)) continue;
    seen.add(row.exerciseId);
    const mine = workout.exercises.filter((e) => e.exerciseId === row.exerciseId);
    if (!mine.length) continue; // упражнение убрали из тренировки — не попытка
    const done = mine.flatMap((e) => e.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0));
    const result = progressTarget({
      target: { sets: row.targetSets, reps: row.targetReps, weight: row.targetWeight, step: row.step, fails: row.fails },
      template: { sets: row.targetSets, reps: row.targetReps },
      done,
    });
    if (!result) continue;
    // По очереди: у транзакции одно соединение
    await tx.templateExercise.update({ where: { id: row.id }, data: { targetWeight: result.weight, fails: result.fails } });
    items.push({
      exercise: mine[0].exercise.name,
      kind: result.kind,
      from: result.from,
      to: result.to,
      fails: result.kind === "same" ? result.fails : 0,
      bodyweight: mine[0].exercise.isBodyweight,
    });
  }
  return items;
}

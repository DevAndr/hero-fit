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
 * Прогрессия заданий при завершении тренировки (в транзакции finishWorkout): шаблон — активного тренера,
 * задания с весом и шагом по упражнениям, которые сейчас в шаблоне. Сравнивается сделанное с заданием.
 */
export async function applyProgression(
  tx: Prisma.TransactionClient,
  userId: string,
  workout: FinishedWorkout,
): Promise<{ items: ProgressionItem[]; coachId: string | null }> {
  if (!workout.templateId) return { items: [], coachId: null };
  const link = await tx.coachLink.findFirst({ where: { clientId: userId, endedAt: null }, select: { coachId: true } });
  if (!link) return { items: [], coachId: null };
  const template = await tx.workoutTemplate.findFirst({
    where: { id: workout.templateId, userId: link.coachId },
    select: {
      exercises: { select: { exerciseId: true, targetSets: true, targetReps: true } },
      coachTargets: { where: { clientId: userId, weight: { not: null }, step: { not: null } } },
    },
  });
  if (!template?.coachTargets.length) return { items: [], coachId: link.coachId };

  const items: ProgressionItem[] = [];
  for (const target of template.coachTargets) {
    const te = template.exercises.find((e) => e.exerciseId === target.exerciseId);
    if (!te) continue; // упражнение убрано из шаблона — задание не читается
    const mine = workout.exercises.filter((e) => e.exerciseId === target.exerciseId);
    const done = mine.flatMap((e) => e.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0));
    const result = progressTarget({ target, template: { sets: te.targetSets, reps: te.targetReps }, done });
    if (!result) continue;
    await tx.coachTarget.update({ where: { id: target.id }, data: { weight: result.weight, fails: result.fails } });
    items.push({
      exercise: mine[0].exercise.name,
      kind: result.kind,
      from: result.from,
      to: result.to,
      fails: result.kind === "same" ? result.fails : 0,
      bodyweight: mine[0].exercise.isBodyweight,
    });
  }
  return { items, coachId: link.coachId };
}

import "server-only";
import { programForTemplate } from "@/lib/coach/program-queries";
import { assignedWhere } from "@/lib/coach/templates";
import type { PlannedSet, Target } from "@/lib/coach/targets";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays } from "@/lib/plans/expand";
import { getLastPerformance } from "@/lib/workouts/queries";

/**
 * Задания клиента по шаблону (ключ — exerciseId); пусто, если шаблон не активного тренера клиента.
 * Только упражнения, которые сейчас в шаблоне: задание по убранному не читается (и не даёт пометку).
 */
export async function getTemplateTargets(clientId: string, templateId: string, day?: string): Promise<Map<string, Target & { program?: string }>> {
  const link = await db.coachLink.findFirst({ where: { clientId, endedAt: null }, select: { coachId: true } });
  if (!link) return new Map();
  // Программа тренера на несколько недель: вес недели поверх задания (день — дата вхождения или «сегодня» клиента)
  const program = await programForTemplate(clientId, templateId, day);
  const rows = await db.coachTarget.findMany({
    where: { clientId, templateId, template: { userId: link.coachId }, exercise: { templateExercises: { some: { templateId } } } },
    select: { exerciseId: true, sets: true, reps: true, weight: true },
  });
  const targets = new Map(rows.map(({ exerciseId, ...t }) => [exerciseId, t]));
  return program.overlay ? program.overlay(targets) : targets;
}

export type ClientTemplateTargets = {
  templateId: string;
  name: string;
  exercises: {
    exerciseId: string;
    name: string;
    /** Своим весом — вес в диалоге как отягощение («Доп. кг»). */
    isBodyweight: boolean;
    template: { sets: number; reps: number | null; weight: number | null };
    /** Задание; step и fails — прогрессия. */
    target: (Target & { step: number | null; fails: number }) | null;
    last: { date: string; sets: PlannedSet[] } | null;
  }[];
};

/** Вкладка «План» тренера: актуальные назначенные клиенту шаблоны тренера, их упражнения, задания и последний результат клиента. */
export async function getClientTargets(clientId: string, coachId: string, timeZone: string, now = new Date()): Promise<ClientTemplateTargets[]> {
  const since = addDays(dayKey(now, timeZone), -1);
  const templates = await db.workoutTemplate.findMany({
    where: assignedWhere(clientId, coachId, since),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      exercises: {
        orderBy: { order: "asc" },
        where: { exercise: { archivedAt: null } },
        select: { exerciseId: true, targetSets: true, targetReps: true, targetWeight: true, exercise: { select: { name: true, isBodyweight: true } } },
      },
      coachTargets: { where: { clientId }, select: { exerciseId: true, sets: true, reps: true, weight: true, step: true, fails: true } },
    },
  });
  const last = await getLastPerformance(clientId, [...new Set(templates.flatMap((t) => t.exercises.map((e) => e.exerciseId)))]);
  return templates.map((t) => {
    const targets = new Map(t.coachTargets.map(({ exerciseId, ...rest }) => [exerciseId, rest]));
    // Упражнение дважды в шаблоне — одна строка: задание у упражнения одно
    const seen = new Set<string>();
    return {
      templateId: t.id,
      name: t.name,
      exercises: t.exercises
        .filter((e) => !seen.has(e.exerciseId) && seen.add(e.exerciseId))
        .map((e) => ({
          exerciseId: e.exerciseId,
          name: e.exercise.name,
          isBodyweight: e.exercise.isBodyweight,
          template: { sets: e.targetSets, reps: e.targetReps, weight: e.targetWeight },
          target: targets.get(e.exerciseId) ?? null,
          last: last[e.exerciseId] ?? null,
        })),
    };
  });
}

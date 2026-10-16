import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { DELOAD_AFTER, progressTarget, type ProgressionItem } from "@/lib/coach/progression";
import { notify } from "@/lib/notifications/service";
import { isDeloadWeek, programLabel, programWeekIndex } from "@/lib/coach/program";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { isEnabled } from "@/lib/flags/server";

type FinishedWorkout = {
  id: string;
  templateId: string | null;
  exercises: {
    exerciseId: string;
    /** `kind` не REPS (на время, кардио) — прогрессия веса не применяется. */
    exercise: { name: string; isBodyweight: boolean; kind?: string };
    sets: { weight: number; reps: number; isWarmup: boolean; completedAt: Date | null }[];
  }[];
};

/**
 * Прогрессия заданий при завершении тренировки (в транзакции finishWorkout): шаблон — активного тренера,
 * задания с весом и шагом по упражнениям, которые сейчас в шаблоне. Сравнивается сделанное с заданием.
 * Разгрузка — уведомление тренеру.
 */
export async function applyProgression(
  tx: Prisma.TransactionClient,
  userId: string,
  workout: FinishedWorkout,
): Promise<{ items: ProgressionItem[]; coachId: string | null; program?: string }> {
  if (!workout.templateId) return { items: [], coachId: null };
  const link = await tx.coachLink.findFirst({ where: { clientId: userId, endedAt: null }, select: { coachId: true } });
  if (!link) return { items: [], coachId: null };
  // Программа тренера на несколько недель ведёт вес сама: автопрогрессия по её шаблонам не действует
  const program = await activeProgramWeek(tx, userId, link.coachId, workout.templateId);
  if (program) return { items: [], coachId: link.coachId, program };
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
    if (mine.some((e) => e.exercise.kind && e.exercise.kind !== "REPS")) continue;
    const done = mine.flatMap((e) => e.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0));
    const result = progressTarget({ target, template: { sets: te.targetSets, reps: te.targetReps }, done });
    if (!result) continue;
    await tx.coachTarget.update({
      where: { id: target.id },
      // Время разгрузки — для сигнала тренеру «Застой на весе»
      data: { weight: result.weight, fails: result.fails, ...(result.kind === "deload" ? { unloadedAt: new Date() } : {}) },
    });
    items.push({
      exercise: mine[0].exercise.name,
      kind: result.kind,
      from: result.from,
      to: result.to,
      fails: result.kind === "same" ? result.fails : 0,
      bodyweight: mine[0].exercise.isBodyweight,
    });
  }
  const deloads = items.filter((i) => i.kind === "deload");
  if (deloads.length) {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, name: true } });
    const kg = (w: number, bw: boolean) => `${bw ? "+" : ""}${w.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
    for (const d of deloads) {
      await notify(
        tx,
        link.coachId,
        {
          type: NotificationType.COACH,
          title: `Разгрузка: ${clientDisplayName(me)}`,
          body: `${d.exercise}: ${kg(d.to, d.bodyweight)} после ${DELOAD_AFTER} неудач`,
          url: `/coach/clients/${userId}/workouts/${workout.id}`,
        },
        { push: true },
      );
    }
  }
  return { items, coachId: link.coachId };
}

/** Метка недели активной программы тренера по шаблону («Неделя 3/8») или null — нет программы, флага или недели. */
async function activeProgramWeek(tx: Prisma.TransactionClient, clientId: string, coachId: string, templateId: string) {
  const a = await tx.programAssignment.findFirst({
    where: { clientId, coachId, endedAt: null, series: { some: { templateId } } },
    orderBy: { createdAt: "desc" },
    select: { startDate: true, weeks: true, deloadEvery: true, client: { select: { timeZone: true } } },
  });
  if (!a || !(await isEnabled("coach_programs", coachId))) return null;
  const week = programWeekIndex(a.startDate, dayKey(new Date(), safeTimeZone(a.client.timeZone)));
  return week !== null && week <= a.weeks ? programLabel(week, a.weeks, isDeloadWeek(week, a.deloadEvery)) : null;
}

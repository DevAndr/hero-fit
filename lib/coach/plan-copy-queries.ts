import "server-only";
import { clientPickLabels } from "@/lib/coach/assign";
import { clientDisplayName } from "@/lib/coach/clients";
import { targetKey, type CopySource } from "@/lib/coach/plan-copy";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";

const planSelect = { templateId: true, title: true, time: true, durationMin: true } as const;

/** План клиента от этого тренера: серии, разовые (не исключения серий), задания по шаблонам тренера и их упражнения. */
export async function getPlanCopySource(coachId: string, clientId: string): Promise<CopySource> {
  const [series, entries, targets, templates] = await Promise.all([
    db.planSeries.findMany({
      where: { userId: clientId, coachId },
      select: { ...planSelect, weekday: true, startDate: true, endDate: true },
    }),
    db.planEntry.findMany({ where: { userId: clientId, coachId, seriesId: null }, select: { ...planSelect, date: true, cancelled: true } }),
    db.coachTarget.findMany({
      where: { clientId, template: { userId: coachId } },
      select: { templateId: true, exerciseId: true, sets: true, reps: true, weight: true, step: true },
    }),
    db.workoutTemplate.findMany({ where: { userId: coachId }, select: { id: true, exercises: { select: { exerciseId: true } } } }),
  ]);
  return {
    series,
    entries,
    targets,
    templateExercises: Object.fromEntries(templates.map((t) => [t.id, t.exercises.map((e) => e.exerciseId)])),
  };
}

/** Кому копировать: активные клиенты тренера без источника; `keys` — их задания по шаблонам тренера. */
export async function getCopyRecipients(coachId: string, sourceId: string, tz: string) {
  const links = await db.coachLink.findMany({
    where: { coachId, endedAt: null, clientId: { not: sourceId } },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      client: {
        select: {
          id: true,
          nickname: true,
          name: true,
          coachTargets: { where: { template: { userId: coachId } }, select: { templateId: true, exerciseId: true } },
        },
      },
    },
  });
  const labels = clientPickLabels(links.map((l) => ({ id: l.client.id, name: clientDisplayName(l.client), linkedDay: dayKey(l.createdAt, tz) })));
  return links.map((l, i) => ({ id: l.client.id, name: labels[i].name, keys: l.client.coachTargets.map(targetKey) }));
}

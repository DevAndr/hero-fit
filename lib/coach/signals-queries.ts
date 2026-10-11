import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { getClientPlan } from "@/lib/coach/plan-queries";
import { assignedWhere } from "@/lib/coach/templates";
import type { SignalInput } from "@/lib/coach/signals";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { addDays } from "@/lib/plans/expand";
import { db } from "@/lib/db";

const WORKOUTS_WINDOW_MS = 42 * 86_400_000;

/** Данные для clientSignals одного клиента: назначения этого тренера, тренировки за 42 дня, задания. */
export async function getSignalInput(
  coachId: string,
  clientId: string,
  tz: string,
  linkedAt: Date,
  now: Date,
): Promise<SignalInput> {
  const since = addDays(dayKey(now, tz), -1);
  const [plan, workouts, last, targets, series, entries] = await Promise.all([
    getClientPlan(coachId, clientId, tz, now),
    db.workout.findMany({
      where: { userId: clientId, status: WorkoutStatus.COMPLETED, finishedAt: { gt: new Date(now.getTime() - WORKOUTS_WINDOW_MS) } },
      select: { finishedAt: true },
    }),
    db.workout.findFirst({
      where: { userId: clientId, status: WorkoutStatus.COMPLETED },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    // Как в диалоге заданий (getClientTargets): только актуально назначенные шаблоны — иначе застой не снять
    db.coachTarget.findMany({
      where: { clientId, template: assignedWhere(clientId, coachId, since) },
      select: { exerciseId: true, fails: true, unloadedAt: true, updatedAt: true, template: { select: { exercises: { select: { exerciseId: true } } } } },
    }),
    // Когда назначено: вхождения раньше дня назначения — не пропуски
    db.planSeries.findMany({ where: { userId: clientId, coachId }, select: { id: true, createdAt: true } }),
    db.planEntry.findMany({ where: { userId: clientId, coachId, seriesId: null }, select: { id: true, createdAt: true } }),
  ]);
  const created = new Map<string, Date>([...series.map((r) => [`s:${r.id}`, r.createdAt] as const), ...entries.map((r) => [`e:${r.id}`, r.createdAt] as const)]);
  // Ключ вхождения: s:<seriesId>:<дата> (в том числе исключения серии) или e:<entryId>
  const assignedAt = (key: string) => created.get(key.startsWith("s:") ? key.split(":").slice(0, 2).join(":") : key) ?? linkedAt;
  return {
    linkedAt,
    lastWorkoutAt: last?.finishedAt ?? null,
    workoutsAt: workouts.flatMap((w) => (w.finishedAt ? [w.finishedAt] : [])),
    plan: [...plan.past, ...plan.upcoming].map((o) => ({ date: o.date, status: o.status, assignedAt: assignedAt(o.key) })),
    // Упражнение убрано из шаблона — задание не читается (как в getTemplateTargets)
    targets: targets.filter((t) => t.template.exercises.some((e) => e.exerciseId === t.exerciseId)),
  };
}

/** Все активные клиенты тренера: данные для сигналов, пояс и имя (для уведомления). */
export async function getSignalInputs(coachId: string, now: Date) {
  const links = await db.coachLink.findMany({
    where: { coachId, endedAt: null },
    select: { createdAt: true, client: { select: { id: true, nickname: true, name: true, timeZone: true } } },
  });
  const entries = await Promise.all(
    links.map(async ({ createdAt, client }) => {
      const tz = safeTimeZone(client.timeZone);
      const input = await getSignalInput(coachId, client.id, tz, createdAt, now);
      return [client.id, { input, tz, name: clientDisplayName(client) }] as const;
    }),
  );
  return new Map(entries);
}

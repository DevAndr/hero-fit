import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { getClientPlan } from "@/lib/coach/plan-queries";
import type { SignalInput } from "@/lib/coach/signals";
import { safeTimeZone } from "@/lib/daily-login";
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
  const [plan, workouts, last, targets] = await Promise.all([
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
    db.coachTarget.findMany({
      where: { clientId, template: { userId: coachId } },
      select: { fails: true, unloadedAt: true, updatedAt: true },
    }),
  ]);
  return {
    linkedAt,
    lastWorkoutAt: last?.finishedAt ?? null,
    workoutsAt: workouts.flatMap((w) => (w.finishedAt ? [w.finishedAt] : [])),
    plan: [...plan.past, ...plan.upcoming].map((o) => ({ date: o.date, status: o.status })),
    targets,
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

import "server-only";
import { NotificationType, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { cancelRestPush, notify } from "@/lib/notifications/service";
import { endSessionOfWorkout } from "@/lib/together/queries";
import { STALE_CANCEL_HOURS, STALE_IDLE_HOURS, STALE_REMIND_HOURS, staleReminderBody, staleWorkoutAction } from "@/lib/workouts/stale";

const H = 3_600_000;

type Row = { id: string; userId: string; name: string; startedAt: Date | null; updatedAt: Date; staleRemindedAt: Date | null };

/**
 * Забытые тренировки (флаг stale_workouts): push «не завершена» через 4 ч, если час нет сохранений, и отмена
 * через сутки — статус CANCELLED, подходы остаются в базе, но никуда не засчитываются. Старые — первыми.
 */
export async function processStaleWorkouts(now: Date): Promise<number> {
  const at = (h: number) => new Date(now.getTime() - h * H);
  const rows = await db.workout.findMany({
    where: {
      status: WorkoutStatus.IN_PROGRESS,
      OR: [
        { startedAt: { lte: at(STALE_CANCEL_HOURS) } },
        { startedAt: { lte: at(STALE_REMIND_HOURS) }, staleRemindedAt: null, updatedAt: { lte: at(STALE_IDLE_HOURS) } },
      ],
    },
    select: { id: true, userId: true, name: true, startedAt: true, updatedAt: true, staleRemindedAt: true },
    orderBy: { startedAt: "asc" },
    take: 500,
  });

  let done = 0;
  for (const w of rows) {
    if (!w.startedAt) continue;
    const action = staleWorkoutAction({ ...w, startedAt: w.startedAt }, now);
    if (!action || !(await isEnabled("stale_workouts", w.userId))) continue;
    done += action === "cancel" ? await cancel(w, now) : await remind(w, w.startedAt, now);
  }
  return done;
}

async function remind(w: Row, startedAt: Date, now: Date) {
  return db.$transaction(async (tx) => {
    // Условие по staleRemindedAt — параллельный тик не напомнит второй раз
    const { count } = await tx.workout.updateMany({
      where: { id: w.id, status: WorkoutStatus.IN_PROGRESS, staleRemindedAt: null },
      data: { staleRemindedAt: now },
    });
    if (count === 0) return 0;
    await notify(
      tx,
      w.userId,
      { type: NotificationType.WORKOUT, title: "Тренировка не завершена", body: staleReminderBody(w.name, startedAt, now), url: "/training" },
      { push: true },
    );
    return 1;
  });
}

async function cancel(w: Row, now: Date) {
  const cancelled = await db.$transaction(async (tx) => {
    // Условие по статусу — тренировку могли завершить прямо сейчас
    const { count } = await tx.workout.updateMany({
      where: { id: w.id, status: WorkoutStatus.IN_PROGRESS },
      data: { status: WorkoutStatus.CANCELLED },
    });
    if (count === 0) return 0;
    await endSessionOfWorkout(tx, w.id, now);
    await notify(
      tx,
      w.userId,
      {
        type: NotificationType.WORKOUT,
        title: "Тренировка отменена",
        body: `«${w.name}» не завершили за сутки — она отменена и в статистику не попала`,
        url: "/training",
      },
      { push: false },
    );
    return 1;
  });
  if (cancelled) await cancelRestPush(w.userId);
  return cancelled;
}

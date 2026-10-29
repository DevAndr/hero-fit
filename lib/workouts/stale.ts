/** Забытые тренировки: напоминание через 4 ч после старта (если час нет сохранений), отмена через сутки. */
export const STALE_REMIND_HOURS = 4;
export const STALE_IDLE_HOURS = 1;
export const STALE_CANCEL_HOURS = 24;

const H = 3_600_000;

export type StaleWorkout = { startedAt: Date; updatedAt: Date; staleRemindedAt: Date | null };

/** updatedAt двигает каждое автосохранение черновика — по нему видно, что подходы ещё отмечают. */
export function staleWorkoutAction(w: StaleWorkout, now: Date): "remind" | "cancel" | null {
  const age = now.getTime() - w.startedAt.getTime();
  if (age >= STALE_CANCEL_HOURS * H) return "cancel";
  if (w.staleRemindedAt || age < STALE_REMIND_HOURS * H) return null;
  return now.getTime() - w.updatedAt.getTime() >= STALE_IDLE_HOURS * H ? "remind" : null;
}

export function staleReminderBody(name: string, startedAt: Date, now: Date) {
  return `«${name}» идёт уже ${Math.floor((now.getTime() - startedAt.getTime()) / H)} ч — завершите или отмените её`;
}

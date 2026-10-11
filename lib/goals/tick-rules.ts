import { deadlineEnd, isAchieved, type GoalRow } from "@/lib/goals/rules";

/** Фора на офлайн-тренировки: финиш с устройства принимается до 24 ч назад (finishWorkoutAction). */
export const GOAL_FAIL_GRACE_MS = 24 * 3_600_000;
const REMIND_BEFORE_MS = 7 * 86_400_000;

/** Что тик делает с активной целью: засчитать, напомнить за 7 дней, провалить по сроку или ничего. */
export function goalTickAction(
  goal: Pick<GoalRow, "type" | "target" | "startValue" | "deadline"> & { reminderAt: Date | null },
  current: number,
  now: Date,
  tz: string,
): "achieve" | "remind" | "fail" | null {
  if (!goal.deadline) return isAchieved(goal, current) ? "achieve" : null;
  const end = deadlineEnd(goal.deadline, tz).getTime();
  if (now.getTime() >= end + GOAL_FAIL_GRACE_MS) return "fail";
  if (isAchieved(goal, current)) return "achieve";
  if (!goal.reminderAt && now.getTime() < end && end - now.getTime() <= REMIND_BEFORE_MS) return "remind";
  return null;
}

/** Пора ли тику заняться целью (по времени, без запросов): окно напоминания без отметки или фора кончилась. */
export function goalDue(goal: { deadline: string | null; reminderAt: Date | null }, now: Date, tz: string): boolean {
  if (!goal.deadline) return false;
  const end = deadlineEnd(goal.deadline, tz).getTime();
  const t = now.getTime();
  if (t >= end + GOAL_FAIL_GRACE_MS) return true;
  return !goal.reminderAt && t < end && end - t <= REMIND_BEFORE_MS;
}

/** При постановке или переносе срока: до конца срока ≤ 7 дней — напоминание «7 дней» не нужно (отметка сразу). */
export function initialReminderAt(deadline: string | null, now: Date, tz: string): Date | null {
  if (!deadline) return null;
  return deadlineEnd(deadline, tz).getTime() - now.getTime() <= REMIND_BEFORE_MS ? now : null;
}

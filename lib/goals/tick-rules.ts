import type { StretchUnit } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { deadlineEnd, isAchieved, type GoalRow } from "@/lib/goals/rules";
import { goalStretchWeeks, weeklyStatus, type WeekSum } from "@/lib/goals/stretch-weekly";

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
  // После конца срока значение могло вырасти уже вне срока — в форе засчитывает только финиш тренировки
  if (now.getTime() >= end) return null;
  if (isAchieved(goal, current)) return "achieve";
  if (!goal.reminderAt && now.getTime() < end && end - now.getTime() <= REMIND_BEFORE_MS) return "remind";
  return null;
}

type WeeklyGoal = Pick<GoalRow, "createdAt" | "deadline" | "target" | "stretchUnit"> & { reminderAt: Date | null };

/** Местный день, по который недели уже закрыты с форой: неделя прошла, если её воскресенье раньше этого дня. */
const closedBy = (now: Date, tz: string) => dayKey(new Date(now.getTime() - GOAL_FAIL_GRACE_MS), tz);

/**
 * Регулярность растяжки: провал — после конца недели без нормы и форы 24 ч (финиш офлайн-тренировки), засчитать —
 * все недели набраны (обычно это делает финиш тренировки), напомнить за 7 дней — как у остальных целей.
 * Флаг `stretching` сюда не передаётся: поставленные цели живут и без него.
 */
export function weeklyTickAction(goal: WeeklyGoal, sums: Map<string, WeekSum>, now: Date, tz: string): "achieve" | "remind" | "fail" | null {
  const weeks = goalStretchWeeks(goal, tz);
  const unit: StretchUnit = goal.stretchUnit ?? "SESSIONS";
  if (weeklyStatus(weeks, sums, closedBy(now, tz), goal.target, unit).failedWeek) return "fail";
  if (weeklyStatus(weeks, sums, dayKey(now, tz), goal.target, unit).achieved) return "achieve";
  if (!goal.deadline) return null;
  const end = deadlineEnd(goal.deadline, tz).getTime();
  if (!goal.reminderAt && now.getTime() < end && end - now.getTime() <= REMIND_BEFORE_MS) return "remind";
  return null;
}

/** Пора ли тику заняться целью (по времени, без запросов): окно напоминания без отметки или фора кончилась. */
export function goalDue(
  goal: { type?: GoalRow["type"]; createdAt?: Date; deadline: string | null; reminderAt: Date | null },
  now: Date,
  tz: string,
): boolean {
  if (!goal.deadline) return false;
  // Регулярность может провалиться до срока — проверяется, как только закрыта (с форой) первая неделя
  if (goal.type === "STRETCH_WEEKLY" && goal.createdAt) {
    const [first] = goalStretchWeeks({ createdAt: goal.createdAt, deadline: goal.deadline }, tz);
    if (first && first.end < closedBy(now, tz)) return true;
  }
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

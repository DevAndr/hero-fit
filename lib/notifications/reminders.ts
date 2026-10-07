import { streakStatus } from "@/lib/progress/streak";

export const STREAK_REMINDER_HOURS = 3;

/** «Не потеряй streak! Осталось N ч» — когда до дедлайна ≤ 3 ч и в этом окне ещё не напоминали. */
export function shouldRemindStreak(
  user: { currentStreak: number; lastStreakAt: Date | null; streakFreezes: number; streakReminderFor: Date | null },
  now: Date,
): { hoursLeft: number } | null {
  const status = streakStatus(user, now);
  if (status.state !== "due" || status.hoursLeft > STREAK_REMINDER_HOURS) return null;
  if (user.streakReminderFor && user.lastStreakAt && user.streakReminderFor.getTime() === user.lastStreakAt.getTime()) {
    return null;
  }
  return { hoursLeft: status.hoursLeft };
}

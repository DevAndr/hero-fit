import { dayKey } from "@/lib/daily-login";
import { plural } from "@/lib/format";
import { weeksText } from "@/lib/progress/streak-copy";
import { localHour, STREAK_REMINDER_HOUR, streakStatus, type StreakUserFields } from "@/lib/progress/weekly-streak";

/**
 * «Не потеряй streak!» — когда тренировок не хватает на оставшиеся дни недели (включая сегодня),
 * с STREAK_REMINDER_HOUR по местному времени и не чаще раза в день.
 */
export function shouldRemindStreak(
  user: StreakUserFields & { streakReminderDay: string | null },
  now: Date,
  tz: string,
): { streak: number; needed: number } | null {
  const status = streakStatus(user, now, tz);
  if (status.state !== "pending" && status.state !== "frozen") return null;
  if (status.needed === 0 || status.needed < status.daysLeft) return null;
  if (localHour(now, tz) < STREAK_REMINDER_HOUR) return null;
  if (user.streakReminderDay === dayKey(now, tz)) return null;
  return { streak: status.streak, needed: status.needed };
}

export function streakReminderBody({ streak, needed }: { streak: number; needed: number }) {
  return `Серия ${weeksText(streak)} — нужно ещё ${needed} ${plural(needed, "тренировка", "тренировки", "тренировок")} до конца воскресенья.`;
}

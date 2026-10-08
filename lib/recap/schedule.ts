/** Когда создавать и отправлять итоги недели — всё в поясе пользователя. */
import { dayKey } from "@/lib/daily-login";
import { addWeeks, localHour, weekKey, weeksBetween } from "@/lib/progress/weekly-streak";
import { RECAP_HOUR, RECAP_LAZY_WEEKS } from "./types";

/** Понедельник прошлой недели в поясе tz. */
export function recapWeekFor(now: Date, tz: string): string {
  return addWeeks(weekKey(now, tz), -1);
}

/** Сейчас местный понедельник и уже не раньше hour:00. */
export function isMondayAfter(now: Date, tz: string, hour: number): boolean {
  return dayKey(now, tz) === weekKey(now, tz) && localHour(now, tz) >= hour;
}

/** Push «Итоги недели»: только итоги прошлой недели, в понедельник с RECAP_HOUR, если ещё не отправлен и не просмотрен. */
export function shouldPushRecap(recap: { week: string; pushedAt: Date | null; seenAt: Date | null }, now: Date, tz: string): boolean {
  return !recap.pushedAt && !recap.seenAt && recap.week === recapWeekFor(now, tz) && isMondayAfter(now, tz, RECAP_HOUR);
}

/** Можно ли показывать итоги недели week: формат и понедельник, неделя закончилась, не старше RECAP_LAZY_WEEKS (для создания на лету). */
export function isRecapWeek(week: string, now: Date, tz: string): "ok" | "invalid" | "not-ended" | "too-old" {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return "invalid";
  const date = new Date(`${week}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== week || date.getUTCDay() !== 1) return "invalid";
  const ago = weeksBetween(week, weekKey(now, tz));
  if (ago < 1) return "not-ended";
  return ago > RECAP_LAZY_WEEKS ? "too-old" : "ok";
}

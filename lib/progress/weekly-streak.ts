/**
 * Streak «в ударе» — недели подряд с тренировками. Неделя — с понедельника 00:00 до воскресенья 24:00
 * в поясе пользователя, её ключ — дата понедельника «YYYY-MM-DD».
 */
import { dayKey } from "@/lib/daily-login";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Ключ «YYYY-MM-DD» как полдень UTC — арифметика дат без влияния DST. */
const noon = (key: string) => Date.parse(`${key}T12:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key: string, n: number) => toKey(noon(key) + n * DAY_MS);

/** 0 = понедельник … 6 = воскресенье, для календарного дня «YYYY-MM-DD». */
const weekdayOf = (key: string) => (new Date(noon(key)).getUTCDay() + 6) % 7;

/** Понедельник недели, в которую попадает момент date в поясе tz. */
export function weekKey(date: Date, tz: string): string {
  const day = dayKey(date, tz);
  return addDays(day, -weekdayOf(day));
}

export function addWeeks(week: string, n: number): string {
  return addDays(week, n * 7);
}

/** Сколько недель от from до to (отрицательно, если to раньше). */
export function weeksBetween(from: string, to: string): number {
  return Math.round((noon(to) - noon(from)) / WEEK_MS);
}

/** Смещение пояса (мс) в момент ms: локальное время − UTC. */
function zoneOffset(ms: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return local - Math.floor(ms / 1000) * 1000;
}

/** Момент 00:00 дня «YYYY-MM-DD» в поясе tz. */
export function localMidnight(day: string, tz: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // Две итерации: смещение берём в уже приближённом моменте (на случай перехода DST в этот день).
  let ms = utcMidnight - zoneOffset(utcMidnight, tz);
  ms = utcMidnight - zoneOffset(ms, tz);
  return new Date(ms);
}

/** Сколько дней недели осталось, включая сегодня: пн → 7, вс → 1. */
export function daysLeftInWeek(now: Date, tz: string): number {
  return 7 - weekdayOf(dayKey(now, tz));
}

export function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Самая длинная серия подряд идущих недель и серия, живая сейчас (последняя — текущая или прошлая неделя). */
export function weeklyRuns(weeks: string[], currentWeek: string): { best: number; current: number } {
  const index = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / WEEK_MS);
  const sorted = [...new Set(weeks.map(index))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (const [i, w] of sorted.entries()) {
    run = i > 0 && w === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted.at(-1);
  const now = index(currentWeek);
  return { best, current: last !== undefined && now - last <= 1 ? run : 0 };
}

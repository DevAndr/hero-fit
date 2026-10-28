import type { StretchUnit } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { addDays, weekdayOf, weekStart } from "@/lib/dates";
import { weekKey, weeksBetween } from "@/lib/progress/weekly-streak";

/**
 * Цель «Регулярность» (`STRETCH_WEEKLY`) — чистые правила. Неделя — пн…вс в поясе пользователя, ключ — дата понедельника.
 * Своей колонки с числом недель нет: недели выводятся из `createdAt` и срока (воскресенье последней недели).
 */

export const WEEKLY_WEEKS_MIN = 2;
export const WEEKLY_WEEKS_MAX = 12;

export type StretchWeek = { start: string; end: string };
export type WeekSum = { sessions: number; sec: number };
export type WeeklyStatus = {
  done: number;
  total: number;
  /** Неделя, в которую попадает `today`; null — вне недель цели. */
  current: { value: number; target: number } | null;
  /** Первая прошедшая неделя без нормы. */
  failedWeek: string | null;
  achieved: boolean;
};

/** Понедельник первой недели: текущая, если до её конца ≥ 4 дней (постановка пн…чт), иначе следующая. */
function firstWeek(createdAt: Date, tz: string): string {
  const day = dayKey(createdAt, tz);
  return weekdayOf(day) <= 3 ? weekStart(day) : addDays(weekStart(day), 7);
}

export function stretchWeeks(createdAt: Date, weeks: number, tz: string): StretchWeek[] {
  const first = firstWeek(createdAt, tz);
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(first, 7 * i);
    return { start, end: addDays(start, 6) };
  });
}

/** Срок цели — воскресенье последней недели. */
export function weeklyDeadline(createdAt: Date, weeks: number, tz: string): string {
  return stretchWeeks(createdAt, weeks, tz)[weeks - 1].end;
}

/** Недели поставленной цели (число — из createdAt и срока). */
export function goalStretchWeeks(goal: { createdAt: Date; deadline: string | null }, tz: string): StretchWeek[] {
  if (!goal.deadline) return [];
  const n = weeksBetween(firstWeek(goal.createdAt, tz), addDays(goal.deadline, 1));
  return n > 0 ? stretchWeeks(goal.createdAt, n, tz) : [];
}

export function weekDone(unit: StretchUnit, target: number, week: WeekSum): boolean {
  return unit === "SESSIONS" ? week.sessions >= target : week.sec >= target * 60;
}

/** Суммы по неделям из сессий растяжки (тренировка + секунды удержаний в ней); неделя — по местному времени финиша. */
export function weeklySums(rows: { finishedAt: Date; sec: number }[], tz: string): Map<string, WeekSum> {
  const out = new Map<string, WeekSum>();
  for (const r of rows) {
    const key = weekKey(r.finishedAt, tz);
    const w = out.get(key) ?? { sessions: 0, sec: 0 };
    out.set(key, { sessions: w.sessions + 1, sec: w.sec + r.sec });
  }
  return out;
}

const ZERO: WeekSum = { sessions: 0, sec: 0 };

/** Засчитанные недели, «эта неделя» и первая проваленная (неделя, которая ещё идёт, провалом не считается). */
export function weeklyStatus(
  weeks: StretchWeek[],
  sums: Map<string, WeekSum>,
  today: string,
  target: number,
  unit: StretchUnit,
): WeeklyStatus {
  const ok = (w: StretchWeek) => weekDone(unit, target, sums.get(w.start) ?? ZERO);
  const done = weeks.filter(ok).length;
  const cur = weeks.find((w) => w.start <= today && today <= w.end);
  const sum = cur ? (sums.get(cur.start) ?? ZERO) : null;
  return {
    done,
    total: weeks.length,
    current: sum ? { value: unit === "SESSIONS" ? sum.sessions : Math.floor(sum.sec / 60), target } : null,
    failedWeek: weeks.find((w) => w.end < today && !ok(w))?.start ?? null,
    achieved: weeks.length > 0 && done === weeks.length,
  };
}

/** Значение цели для общих правил (`isAchieved`, `goalProgress`): доля засчитанных недель, 0…1. */
export function weeklyValue(s: Pick<WeeklyStatus, "done" | "total">): number {
  if (s.total === 0) return 0;
  return s.done === s.total ? 1 : s.done / s.total;
}

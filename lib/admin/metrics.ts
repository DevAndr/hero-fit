/** Метрики админки: чистые преобразования рядов и когорт (даты — строки YYYY-MM-DD, арифметика в UTC). */

import { addDays } from "@/lib/dates";

export type DayPoint = { day: string; value: number };

export type CohortRow = {
  /** понедельник недели регистрации */
  week: string;
  size: number;
  /** % активных в неделю i после регистрации; null — неделя ещё не наступила */
  cells: (number | null)[];
};

const COHORT_WEEKS = 7;

export function parseRange(raw: string | string[] | undefined): 30 | 90 {
  return raw === "90" ? 90 : 30;
}

/** Изменение к прошлому периоду в процентах; без базы сравнения — null («—»). */
export function deltaPercent(now: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((now - prev) / prev) * 100);
}


/** Все дни от from до to включительно; дней без данных — 0. */
export function fillDays(rows: DayPoint[], from: string, to: string): DayPoint[] {
  const byDay = new Map(rows.map((r) => [r.day, r.value]));
  const out: DayPoint[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) out.push({ day, value: byDay.get(day) ?? 0 });
  return out;
}

/** Сетка удержания: когорта × неделя после регистрации, новые когорты сверху. */
export function cohortGrid(
  cohorts: { week: string; size: number }[],
  active: { week: string; offset: number; users: number }[],
  currentWeek: string,
  weeks = COHORT_WEEKS,
): CohortRow[] {
  const users = new Map(active.map((a) => [`${a.week}:${a.offset}`, a.users]));
  return [...cohorts]
    .sort((a, b) => b.week.localeCompare(a.week))
    .map(({ week, size }) => ({
      week,
      size,
      cells: Array.from({ length: weeks }, (_, offset) => {
        if (addDays(week, 7 * offset) > currentWeek) return null;
        if (size === 0) return 0;
        return Math.round(((users.get(`${week}:${offset}`) ?? 0) / size) * 100);
      }),
    }));
}

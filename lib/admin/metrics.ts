/** Метрики админки: чистые преобразования рядов и когорт (даты — строки YYYY-MM-DD, арифметика в UTC). */

import { addDays } from "@/lib/dates";

export type DayPoint = { day: string; value: number };
export type HourPoint = { hour: number; value: number };

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

/** Часы 0–23 по порядку; часов без данных — 0. */
export function fillHours(rows: HourPoint[]): HourPoint[] {
  const byHour = new Map(rows.map((r) => [r.hour, r.value]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, value: byHour.get(hour) ?? 0 }));
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

/**
 * Сырые счётчики по паре «группа × вложенная строка» («страница входа × источник» или «utm_source × utm_campaign»):
 * firstWorkout и activeWeek2 — пользователей, eligible — зарегистрированных ≥ 14 дней назад.
 */
export type SourceRow = {
  group: string | null;
  child: string | null;
  signups: number;
  firstWorkout: number;
  activeWeek2: number;
  eligible: number;
};

export type SourceStats = { signups: number; firstWorkoutPct: number; activeWeek2Pct: number | null };
export type SourceGroup = SourceStats & { key: string | null; children: (SourceStats & { key: string | null })[] };

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Доли от сумм; activeWeek2 — от eligible (нет таких пользователей — null). */
function stats(rows: SourceRow[]): SourceStats {
  const sum = (k: "signups" | "firstWorkout" | "activeWeek2" | "eligible") => rows.reduce((s, r) => s + r[k], 0);
  const eligible = sum("eligible");
  return {
    signups: sum("signups"),
    firstWorkoutPct: pct(sum("firstWorkout"), sum("signups")),
    activeWeek2Pct: eligible === 0 ? null : pct(sum("activeWeek2"), eligible),
  };
}

/** Итог по группе с вложенными строками; группы и строки — по регистрациям убыв. */
export function sourceRows(rows: SourceRow[]): SourceGroup[] {
  const byGroup = new Map<string | null, SourceRow[]>();
  for (const r of rows) byGroup.set(r.group, [...(byGroup.get(r.group) ?? []), r]);
  return [...byGroup]
    .map(([key, group]) => ({
      key,
      ...stats(group),
      children: group.map((r) => ({ key: r.child, ...stats([r]) })).sort((a, b) => b.signups - a.signups),
    }))
    .sort((a, b) => b.signups - a.signups);
}

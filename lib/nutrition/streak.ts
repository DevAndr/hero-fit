/** Серия дневника питания и дни «в норме» (спека 2026-10-31-nutrition-game). Зачётные дни отбирает SQL (streak-queries.ts). */
import { addDays } from "@/lib/dates";

/** Зачётный день: записи минимум в двух разных приёмах и сумма от 800 ккал — пустой записью серию не накрутить. */
export const DIARY_DAY_MIN_MEALS = 2;
export const DIARY_DAY_MIN_KCAL = 800;
/** «В норме» — съедено в пределах ±10 % дневной нормы. */
export const NORM_TOLERANCE = 0.1;

export type DiaryDay = { date: string; kcal: number };

/** Подряд идущие зачётные дни; текущая серия жива, если последний зачётный — сегодня или вчера. */
export function diaryStreak(days: DiaryDay[], today: string): { current: number; longest: number } {
  const dates = [...new Set(days.map((d) => d.date))].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of dates) {
    run = prev !== null && addDays(prev, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = date;
  }
  const alive = prev === today || prev === addDays(today, -1);
  return { current: alive ? run : 0, longest };
}

export function normDays(days: DiaryDay[], normKcal: number | null): number {
  if (!normKcal) return 0;
  const lo = normKcal * (1 - NORM_TOLERANCE);
  const hi = normKcal * (1 + NORM_TOLERANCE);
  return days.filter((d) => d.kcal >= lo && d.kcal <= hi).length;
}

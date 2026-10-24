/** Дашборд v2 (спека docs/superpowers/specs/2026-10-24-dashboard-v2-design.md): чистая логика полосы недели и виджетов. */

import type { MuscleGroup } from "@/generated/prisma/enums";
import { addDays, weekStart } from "@/lib/dates";
import { plural } from "@/lib/format";
import { STREAK_WEEK_TARGET } from "@/lib/progress/weekly-streak";

export type StripDay = {
  day: string;
  /** 0 = понедельник … 6 = воскресенье */
  weekday: number;
  done: boolean;
  today: boolean;
  planned: boolean;
  past: boolean;
};

/** Семь дней недели today (с понедельника): тренировки (только завершённые), план, сегодня. */
export function weekStrip(input: { today: string; workoutDays: string[]; plannedDays: string[] }): StripDay[] {
  const monday = weekStart(input.today);
  const done = new Set(input.workoutDays);
  const planned = new Set(input.plannedDays);
  return Array.from({ length: 7 }, (_, weekday) => {
    const day = addDays(monday, weekday);
    return { day, weekday, done: done.has(day), today: day === input.today, planned: planned.has(day), past: day < input.today };
  });
}

export type WeekTotals = { volume: number; seconds: number; sets: number; records: number };
export type Delta = { pct: number; dir: "up" | "down" | "same" };
export type WeekCompareView = { cur: WeekTotals; volume: Delta | null; seconds: Delta | null; sets: Delta | null };

function delta(cur: number, prev: number | undefined): Delta | null {
  if (!prev) return null;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { pct, dir: pct >= 1 ? "up" : pct <= -1 ? "down" : "same" };
}

/** Эта неделя к тому же отрезку прошлой; без прошлой или с нулём в поле — без сравнения. */
export function weekCompare(cur: WeekTotals, prev: WeekTotals | null): WeekCompareView {
  return { cur, volume: delta(cur.volume, prev?.volume), seconds: delta(cur.seconds, prev?.seconds), sets: delta(cur.sets, prev?.sets) };
}

export type Slice = { key: MuscleGroup | "other"; sets: number; pct: number };

/** Доли подходов по группам: top крупнейших и «прочие»; проценты — методом наибольшего остатка (в сумме ровно 100). */
export function balanceSlices(rows: { group: MuscleGroup; sets: number }[], top = 5): Slice[] {
  const sorted = rows.filter((r) => r.sets > 0).sort((a, b) => b.sets - a.sets);
  const kept: { key: Slice["key"]; sets: number }[] = sorted.slice(0, top).map((r) => ({ key: r.group, sets: r.sets }));
  const rest = sorted.slice(top).reduce((s, r) => s + r.sets, 0);
  if (rest > 0) kept.push({ key: "other", sets: rest });
  const total = kept.reduce((s, r) => s + r.sets, 0);
  if (total === 0) return [];
  const raw = kept.map((r) => (r.sets / total) * 100);
  const pct = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  const missing = 100 - pct.reduce((s, v) => s + v, 0);
  for (let k = 0; k < missing; k++) pct[order[k][1]] += 1;
  return kept.map((r, i) => ({ ...r, pct: pct[i] }));
}

/** Подпись героя: сколько тренировок до засчитанной недели или что неделя уже в серии. */
export function weekHeadline(weekWorkouts: number, streak: number): string {
  const left = STREAK_WEEK_TARGET - weekWorkouts;
  if (left > 0) return `Ещё ${left} ${plural(left, "тренировка", "тренировки", "тренировок")} — и неделя засчитана в серию`;
  return `Неделя засчитана — серия ${streak} ${plural(streak, "неделя", "недели", "недель")}`;
}

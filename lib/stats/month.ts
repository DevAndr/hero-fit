import type { StrengthTrend } from "@/lib/stats/strength";

/** «Месяц к месяцу» (спека 2026-10-12-strength-analytics): текущий месяц по сегодня против тех же дней прошлого. */

export type MonthTotals = { workouts: number; hours: number; volume: number; records: number };
type Range = { from: string; to: string };
export type MonthCompare = {
  title: string;
  caption: string;
  rows: { label: string; cur: string; prev: string; dir: "up" | "same" | "down" }[];
  strength: StrengthTrend | null;
};

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const pad = (n: number) => String(n).padStart(2, "0");
const parts = (day: string) => day.split("-").map(Number) as [number, number, number];
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m — 1…12
const prevMonth = (y: number, m: number): [number, number] => (m === 1 ? [y - 1, 12] : [y, m - 1]);
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function monthRanges(today: string): { cur: Range; prev: Range; prevFull: Range } {
  const [y, m, d] = parts(today);
  const [py, pm] = prevMonth(y, m);
  const last = daysIn(py, pm);
  return {
    cur: { from: iso(y, m, 1), to: today },
    prev: { from: iso(py, pm, 1), to: iso(py, pm, Math.min(d, last)) },
    prevFull: { from: iso(py, pm, 1), to: iso(py, pm, last) },
  };
}

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const monday = (day: string) => {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
function mondays({ from, to }: Range): string[] {
  const out: string[] = [];
  for (let w = monday(from); w <= to; ) {
    out.push(w);
    const d = toDate(w);
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * Окна тренда силы: «сейчас» — недели, начавшиеся в текущем месяце (пока такой нет — пусто, силу не сравниваем:
 * неделя на стыке почти целиком из прошлого месяца), «раньше» — недели, пересекающие прошлый месяц.
 */
export function monthWeeks(today: string): { recent: string[]; before: string[] } {
  const r = monthRanges(today);
  return { recent: mondays(r.cur).filter((w) => w >= r.cur.from), before: mondays(r.prevFull) };
}

const num = (n: number, digits = 0) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const volume = (kg: number) => (kg >= 1000 ? `${num(kg / 1000, 1)} т` : `${num(kg)} кг`);
const span = (r: Range) => {
  const [, m, from] = parts(r.from);
  const to = parts(r.to)[2];
  return `${from === to ? from : `${from}–${to}`} ${MONTHS_GEN[m - 1]}`;
};
const capital = (s: string) => s.charAt(0).toLocaleUpperCase("ru") + s.slice(1);

export function monthCompare(cur: MonthTotals, prev: MonthTotals, trend: StrengthTrend, today: string): MonthCompare {
  const r = monthRanges(today);
  const m = parts(today)[1];
  const pm = parts(r.prev.from)[1];
  const row = (label: string, a: number, b: number, fmt: (n: number) => string) => ({
    label,
    cur: fmt(a),
    prev: fmt(b),
    dir: (Math.abs(a - b) < 1e-9 ? "same" : a > b ? "up" : "down") as "up" | "same" | "down",
  });
  return {
    title: `${capital(MONTHS[m - 1])} против ${MONTHS_GEN[pm - 1]}`,
    caption: `${span(r.cur)} против ${span(r.prev)}`,
    rows: [
      row("Тренировки", cur.workouts, prev.workouts, (n) => num(n)),
      row("Часы", cur.hours, prev.hours, (n) => num(n, 1)),
      row("Объём", cur.volume, prev.volume, volume),
      row("Рекорды", cur.records, prev.records, (n) => num(n)),
    ],
    strength: trend.of > 0 ? trend : null,
  };
}

import { addDays } from "@/lib/dates";
import { plural } from "@/lib/format";

/** Тренд силы (спека 2026-10-12-strength-analytics): лучший результат по неделям, окно «сейчас» против «раньше». */

/** Лучшее за неделю (понедельник в поясе пользователя) в одном упражнении — рабочие выполненные подходы. */
export type WeekBest = {
  exerciseId: string;
  name: string;
  bodyweight: boolean;
  week: string;
  /** Эпли по подходам с весом и повторами ≤ 12; null — таких не было. */
  oneRm: number | null;
  maxWeight: number;
  maxReps: number;
  /** Разных тренировок с упражнением за неделю. */
  sessions: number;
};

/** bodyweight — сравнение по повторам (from/to — повторы), иначе по 1ПМ в кг. */
export type TrendItem = { exerciseId: string; name: string; bodyweight: boolean; from: number; to: number; pct: number };
/** of — упражнений в сравнении (включая «спад»), top — до 3 «сильнее». */
export type StrengthTrend = { stronger: number; of: number; top: TrendItem[] };

export const TREND_MIN_SESSIONS = 2;
const TREND_WEEKS = 4;
const STRONGER_PCT = 0.01;
const TOP = 3;


/** Окна по 4 недели: «сейчас» кончается неделей week (понедельник), «раньше» — 4 недели перед ним. */
export function trendWindows(week: string): { recent: string[]; before: string[] } {
  const weeks = Array.from({ length: TREND_WEEKS * 2 }, (_, i) => addDays(week, -7 * (TREND_WEEKS * 2 - 1 - i)));
  return { before: weeks.slice(0, TREND_WEEKS), recent: weeks.slice(TREND_WEEKS) };
}

type Window = { sessions: number; oneRm: number | null; reps: number };

function windowOf(rows: WeekBest[], weeks: string[]): Window {
  const inside = rows.filter((r) => weeks.includes(r.week));
  const oneRms = inside.map((r) => r.oneRm).filter((v): v is number => v !== null && v > 0);
  return {
    sessions: inside.reduce((s, r) => s + r.sessions, 0),
    oneRm: oneRms.length ? Math.max(...oneRms) : null,
    reps: inside.reduce((m, r) => Math.max(m, r.maxReps), 0),
  };
}

const halfKg = (n: number) => Math.round(n * 2) / 2;
const tenthKg = (n: number) => Math.round(n * 10) / 10;
/** До 0,5 кг; если так рост пропадает (лёгкие упражнения) — до 0,1. */
const shownKg = (from: number, to: number) =>
  halfKg(from) < halfKg(to) ? { from: halfKg(from), to: halfKg(to) } : { from: tenthKg(from), to: tenthKg(to) };
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function strengthTrend(rows: WeekBest[], windows: { recent: string[]; before: string[] }): StrengthTrend {
  const byExercise = new Map<string, WeekBest[]>();
  for (const r of rows) byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);

  let of = 0;
  const stronger: TrendItem[] = [];
  for (const [exerciseId, list] of byExercise) {
    const before = windowOf(list, windows.before);
    const recent = windowOf(list, windows.recent);
    if (before.sessions < TREND_MIN_SESSIONS || recent.sessions < TREND_MIN_SESSIONS) continue;
    // Свой вес или нет 1ПМ ни в одном окне — сравниваем повторы. 1ПМ только в одном окне (сменил диапазон повторов
    // или записал без веса) — не сравниваем: повторы тяжёлого и лёгкого блока несравнимы
    const oneRmIn = Number(before.oneRm !== null) + Number(recent.oneRm !== null);
    if (!list[0].bodyweight && oneRmIn === 1) continue;
    const byReps = list[0].bodyweight || oneRmIn === 0;
    const from = byReps ? before.reps : before.oneRm!;
    const to = byReps ? recent.reps : recent.oneRm!;
    if (from <= 0 || to <= 0) continue;
    of++;
    const isStronger = byReps ? to - from >= 1 : (to - from) / from >= STRONGER_PCT;
    if (!isStronger) continue;
    stronger.push({
      exerciseId,
      name: list[0].name,
      bodyweight: byReps,
      ...(byReps ? { from, to } : shownKg(from, to)),
      pct: round4((to - from) / from),
    });
  }
  stronger.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name, "ru"));
  return { stronger: stronger.length, of, top: stronger.slice(0, TOP) };
}

export function trendHeadline(t: StrengthTrend): string {
  if (t.stronger > 0) {
    return `Ты стал сильнее в ${t.stronger} из ${t.of} ${plural(t.of, "упражнения", "упражнений", "упражнений")}`;
  }
  return `Держишь уровень в ${t.of} ${plural(t.of, "упражнении", "упражнениях", "упражнениях")}`;
}

const kg = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function trendLine(i: TrendItem): string {
  if (i.bodyweight) return `${i.name} · ${i.from} → ${i.to} ${plural(i.to, "повтор", "повтора", "повторов")}`;
  return `${i.name} · 1ПМ ${kg(i.from)} → ${kg(i.to)} кг · +${Math.round(i.pct * 100)} %`;
}

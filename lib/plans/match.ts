import { dayKey } from "../daily-login";
import { addDays, type Occurrence } from "./expand";

export type DoneWorkout = { id: string; planKey: string | null; startedAt: Date; finishedAt: Date };
export type PlanStatus = "done" | "missed" | "today" | "planned";
export type MatchedOccurrence = Occurrence & { status: PlanStatus; workoutId?: string };

/**
 * Статусы вхождений по завершённым тренировкам: тренировка с planKey закрывает своё вхождение, без него —
 * первое по времени невыполненное вхождение того же местного дня; остальные — «вне плана» (extra).
 */
export function matchPlans(
  occurrences: Occurrence[],
  workouts: DoneWorkout[],
  today: string,
  tz: string,
): { occurrences: MatchedOccurrence[]; extra: DoneWorkout[] } {
  const byKey = new Map(occurrences.map((o) => [o.key, o]));
  const done = new Map<string, string>();
  const unlinked: DoneWorkout[] = [];
  const extra: DoneWorkout[] = [];

  for (const w of [...workouts].sort((a, b) => a.finishedAt.getTime() - b.finishedAt.getTime())) {
    if (w.planKey && byKey.has(w.planKey) && !done.has(w.planKey)) done.set(w.planKey, w.id);
    else if (w.planKey) extra.push(w);
    else unlinked.push(w);
  }
  const ordered = [...occurrences].sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
  for (const w of unlinked) {
    const day = dayKey(w.finishedAt, tz);
    const open = ordered.find((o) => o.date === day && !done.has(o.key));
    if (open) done.set(open.key, w.id);
    else extra.push(w);
  }

  return {
    occurrences: occurrences.map((o) => {
      const workoutId = done.get(o.key);
      if (workoutId) return { ...o, status: "done", workoutId };
      return { ...o, status: o.date < today ? "missed" : o.date === today ? "today" : "planned" };
    }),
    extra: extra.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()),
  };
}

export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Пересекающиеся события дня — в колонки рядом (жадно), cols — ширина группы пересечений. */
export function layoutDay(events: { key: string; start: number; end: number }[]): Map<string, { col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const result = new Map<string, { col: number; cols: number }>();
  let group: { key: string; col: number }[] = [];
  let colEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const g of group) result.set(g.key, { col: g.col, cols: colEnds.length });
    group = [];
    colEnds = [];
  };
  for (const e of sorted) {
    if (e.start >= groupEnd) flush();
    let col = colEnds.findIndex((end) => end <= e.start);
    if (col === -1) col = colEnds.push(e.end) - 1;
    else colEnds[col] = e.end;
    group.push({ key: e.key, col });
    groupEnd = Math.max(groupEnd, e.end);
  }
  flush();
  return result;
}

/** 42 даты (6 недель с понедельника), покрывающие месяц «YYYY-MM». */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -((new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

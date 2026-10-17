import { plural } from "@/lib/format";
import { isDeloadWeek, programWeekIndex } from "@/lib/coach/program";
import type { SignalKind } from "@/lib/coach/signals";
import type { FinishMeta } from "@/lib/workouts/finish";
import { addWeeks, localMidnight } from "@/lib/progress/weekly-streak";

/** Версия формата JSON в CoachWeeklyRecap.data и CoachRecapClient.data. */
export const COACH_RECAP_VERSION = 1;

export type RecapProgression = { exercise: string; kind: "up" | "deload"; from: number; to: number; bodyweight: boolean };

export type CoachRecapRow = {
  version: 1;
  isNew: boolean;
  plan: { done: number; total: number } | null;
  workouts: number;
  prevWorkouts: number;
  /** names — до 3, уникальные, в порядке появления. */
  records: { count: number; names: string[] };
  /** items — до 3; ups — все повышения. */
  progression: { items: RecapProgression[]; more: number; ups: number };
  program: { week: number; weeks: number; nextDeload: boolean; ending: boolean } | null;
  signals: SignalKind[];
  unanswered: number;
};

export type CoachRecapTotals = {
  version: 1;
  clients: number;
  trained: number;
  plan: { done: number; total: number } | null;
  prevPlanPct: number | null;
  workouts: number;
  records: number;
  ups: number;
  attention: number;
  unanswered: number;
};

export type ClientRecapInput = {
  isNew: boolean;
  plan: { done: number; total: number } | null;
  workouts: number;
  prevWorkouts: number;
  metas: Pick<FinishMeta, "records" | "progression" | "progressionSource">[];
  program: { startDate: string; weeks: number; deloadEvery: number | null } | null;
  /** Воскресенье недели снимка, "YYYY-MM-DD". */
  sunday: string;
  signals: SignalKind[];
  unanswered: number;
};

const MAX_ITEMS = 3;

/**
 * Когда неделя week закончилась у всех клиентов: самый поздний «следующий понедельник 00:00» по их поясам
 * (клиент западнее тренера ещё в воскресенье — снимок раньше потерял бы его тренировки).
 */
export function recapReadyAt(week: string, clientTzs: string[]): Date | null {
  if (!clientTzs.length) return null;
  const next = addWeeks(week, 1);
  return new Date(Math.max(...clientTzs.map((tz) => localMidnight(next, tz).getTime())));
}

export const planPct = (plan: { done: number; total: number }) => Math.round((plan.done / plan.total) * 100);

function buildProgram(program: ClientRecapInput["program"], sunday: string): CoachRecapRow["program"] {
  if (!program) return null;
  const week = programWeekIndex(program.startDate, sunday);
  if (week === null) return null;
  const { weeks, deloadEvery } = program;
  return { week, weeks, nextDeload: week + 1 <= weeks && isDeloadWeek(week + 1, deloadEvery), ending: week >= weeks - 1 };
}

export function buildClientRow(input: ClientRecapInput): CoachRecapRow {
  const records = input.metas.flatMap((m) => m.records ?? []);
  const names = [...new Set(records.map((r) => r.exerciseName))].slice(0, MAX_ITEMS);

  const items: RecapProgression[] = input.metas
    .filter((m) => m.progressionSource !== "own")
    .flatMap((m) => m.progression ?? [])
    .flatMap((p) => (p.kind === "up" || p.kind === "deload" ? [{ exercise: p.exercise, kind: p.kind, from: p.from, to: p.to, bodyweight: p.bodyweight }] : []));
  const ups = items.filter((p) => p.kind === "up").length;

  return {
    version: COACH_RECAP_VERSION,
    isNew: input.isNew,
    plan: input.plan,
    workouts: input.workouts,
    prevWorkouts: input.prevWorkouts,
    records: { count: records.length, names },
    progression: { items: items.slice(0, MAX_ITEMS), more: Math.max(0, items.length - MAX_ITEMS), ups },
    program: buildProgram(input.program, input.sunday),
    signals: input.signals,
    unanswered: input.unanswered,
  };
}

export function buildTotals(rows: CoachRecapRow[], prev: CoachRecapTotals | null): CoachRecapTotals {
  const planned = rows.filter((r) => r.plan);
  const plan = planned.length
    ? { done: planned.reduce((s, r) => s + r.plan!.done, 0), total: planned.reduce((s, r) => s + r.plan!.total, 0) }
    : null;
  const sum = (f: (r: CoachRecapRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    version: COACH_RECAP_VERSION,
    clients: rows.length,
    trained: rows.filter((r) => r.workouts > 0).length,
    plan,
    prevPlanPct: prev?.plan && prev.plan.total > 0 ? planPct(prev.plan) : null,
    workouts: sum((r) => r.workouts),
    records: sum((r) => r.records.count),
    ups: sum((r) => r.progression.ups),
    attention: rows.filter((r) => r.signals.length > 0).length,
    unanswered: sum((r) => r.unanswered),
  };
}

/** Порядок: сигналов больше — выше; без тренировок; с рекордами или повышениями; затем по имени. */
export function sortRecapRows<T extends { name: string; row: CoachRecapRow }>(rows: T[]): T[] {
  const rank = (r: CoachRecapRow) => [-r.signals.length, r.workouts === 0 ? 0 : 1, r.records.count + r.progression.ups > 0 ? 0 : 1];
  return [...rows].sort((a, b) => {
    const ra = rank(a.row);
    const rb = rank(b.row);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.name.localeCompare(b.name, "ru");
  });
}

export function recapPushBody(t: CoachRecapTotals): string {
  if (t.trained === 0) return "Неделя клиентов: никто не тренировался — загляните, кому написать";
  const head = `Неделя клиентов: ${t.trained} из ${t.clients} тренировались${t.plan ? `, план ${planPct(t.plan)}%` : ""}`;
  if (t.attention > 0) return `${head}. ${t.attention} ${plural(t.attention, "требует", "требуют", "требуют")} внимания`;
  if (t.records > 0) return `${head}. ${t.records} ${plural(t.records, "рекорд", "рекорда", "рекордов")}`;
  return head;
}

const hasVersion = (v: unknown) => !!v && typeof v === "object" && (v as { version?: unknown }).version === COACH_RECAP_VERSION;

export const isCoachRecapRow = (v: unknown): v is CoachRecapRow => hasVersion(v);
export const isCoachRecapTotals = (v: unknown): v is CoachRecapTotals => hasVersion(v);

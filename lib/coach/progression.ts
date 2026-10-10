/** Прогрессия в задании тренера: успех — +шаг, неудача — тот же вес, третья неудача подряд — разгрузка. */

export const DELOAD_AFTER = 3;
export const DELOAD_FACTOR = 0.9;
export const DELOAD_ROUND = 2.5;

export type ProgressInput = {
  target: { sets: number | null; reps: number | null; weight: number | null; step: number | null; fails: number };
  template: { sets: number; reps: number | null };
  /** Выполненные рабочие подходы упражнения в тренировке (разминка не входит). */
  done: { weight: number; reps: number }[];
};
export type ProgressResult = { weight: number; fails: number; kind: "up" | "same" | "deload"; from: number; to: number };
export type ProgressionItem = { exercise: string; kind: ProgressResult["kind"]; from: number; to: number; fails: number; bodyweight: boolean };

const round = (n: number) => Math.round(n * 100) / 100;

export function progressTarget({ target, template, done }: ProgressInput): ProgressResult | null {
  const { weight, step } = target;
  if (weight === null || step === null || !done.length) return null;
  const sets = target.sets ?? template.sets;
  const reps = target.reps ?? template.reps ?? 1;
  const good = done.filter((s) => s.weight >= weight && s.reps >= reps).length;
  if (good >= sets) {
    const to = round(weight + step);
    return { weight: to, fails: 0, kind: "up", from: weight, to };
  }
  const fails = target.fails + 1;
  if (fails < DELOAD_AFTER) return { weight, fails, kind: "same", from: weight, to: weight };
  const to = Math.max(0, round(Math.floor(round(weight * DELOAD_FACTOR) / DELOAD_ROUND) * DELOAD_ROUND));
  return { weight: to, fails: 0, kind: "deload", from: weight, to };
}

const kg = (w: number, bodyweight: boolean) => `${bodyweight ? "+" : ""}${w.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} кг`;
const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Строка блока «План тренера» в сводке. */
export function progressionLine(item: ProgressionItem): string {
  const w = kg(item.to, item.bodyweight);
  if (item.kind === "up") return `${item.exercise}: в следующий раз ${w} (+${num(round(item.to - item.from))})`;
  if (item.kind === "deload") return `${item.exercise}: разгрузка — ${w} (−10 %)`;
  return `${item.exercise}: повторим ${w} · неудача ${item.fails} из ${DELOAD_AFTER}`;
}

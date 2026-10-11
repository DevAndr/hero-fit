/** Своя прогрессия в шаблоне: цель строки (подходы × повторы × вес) и шаг — чистые функции. Правило — progressTarget. */
import type { Target } from "@/lib/coach/targets";

export type OwnRow = { exerciseId: string; targetSets: number; targetReps: number | null; targetWeight: number | null; step: number | null; fails: number };

/** Неудачи подряд при пересоздании строки: вес и шаг те же — прежний счётчик, иначе с нуля. */
export function carryFails(
  old: { targetWeight: number | null; step: number | null; fails: number } | undefined,
  next: { targetWeight: number | null; step: number | null },
): number {
  return old && old.targetWeight === next.targetWeight && old.step === next.step ? old.fails : 0;
}

/** Цели запуска: строки с весом и шагом; упражнение дважды в шаблоне — первая строка. */
export function ownTargets(rows: OwnRow[]): Map<string, Target> {
  const targets = new Map<string, Target>();
  for (const r of rows) {
    if (r.targetWeight === null || r.step === null || targets.has(r.exerciseId)) continue;
    targets.set(r.exerciseId, { sets: r.targetSets, reps: r.targetReps, weight: r.targetWeight });
  }
  return targets;
}

const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** «Прогрессия: +2,5 кг, когда сделаешь 4 × 8 · 60 кг»; своим весом — отягощение «+10 кг». */
export function progressionHint(
  row: { targetSets: number; targetReps: number | null; targetWeight: number | null; step: number | null },
  { bodyweight = false }: { bodyweight?: boolean } = {},
): string | null {
  if (row.targetWeight === null || row.step === null) return null;
  const weight = `${bodyweight ? "+" : ""}${num(row.targetWeight)} кг`;
  return `Прогрессия: +${num(row.step)} кг, когда сделаешь ${row.targetSets} × ${row.targetReps || 1} · ${weight}`;
}

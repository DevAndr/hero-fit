/** Своя прогрессия в шаблоне: цель строки (подходы × повторы × вес) и шаг — чистые функции. Правило — progressTarget. */
import type { Target } from "@/lib/coach/targets";

export type OwnRow = { exerciseId: string; targetSets: number; targetReps: number | null; targetWeight: number | null; step: number | null; fails: number };

type Goal = { targetSets?: number; targetReps?: number | null; targetWeight: number | null; step: number | null };

/** Неудачи подряд при пересоздании строки: цель (подходы, повторы, вес) и шаг те же — прежний счётчик, иначе с нуля. */
export function carryFails(old: (Goal & { fails: number }) | undefined, next: Goal): number {
  if (!old || old.targetWeight !== next.targetWeight || old.step !== next.step) return 0;
  if (old.targetSets !== next.targetSets || (old.targetReps ?? null) !== (next.targetReps ?? null)) return 0;
  return old.fails;
}

/** Первая строка каждого упражнения (строки — в порядке шаблона): прогрессия ведётся только по ней. */
function firstRows<T extends { exerciseId: string }>(rows: T[]): Map<string, T> {
  const first = new Map<string, T>();
  for (const r of rows) if (!first.has(r.exerciseId)) first.set(r.exerciseId, r);
  return first;
}

/** Неудачи новых строк при пересохранении шаблона: первой строке упражнения — по первой старой, повторам — 0. */
export function rowFails(next: (Goal & { exerciseId: string; targetSets: number })[], old: (OwnRow & Goal)[]): number[] {
  const before = firstRows(old);
  const seen = new Set<string>();
  return next.map((r) => {
    if (seen.has(r.exerciseId)) return 0;
    seen.add(r.exerciseId);
    return carryFails(before.get(r.exerciseId), r);
  });
}

/**
 * «Добавить в шаблон» из тренировки: у первой строки упражнения со своей прогрессией цель целиком (подходы, повторы,
 * вес), шаг и неудачи — из шаблона, иначе неудачная тренировка снизила бы цель или откатила +шаг.
 */
export function keepProgress<T extends { exerciseId: string }>(items: T[], old: OwnRow[]): (T | (T & Omit<OwnRow, "exerciseId">))[] {
  const before = firstRows(old);
  const seen = new Set<string>();
  return items.map((item) => {
    const kept = before.get(item.exerciseId);
    const first = !seen.has(item.exerciseId);
    seen.add(item.exerciseId);
    if (!first || !kept || kept.step === null || kept.targetWeight === null) return item;
    const { targetSets, targetReps, targetWeight, step, fails } = kept;
    return { ...item, targetSets, targetReps, targetWeight, step, fails };
  });
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

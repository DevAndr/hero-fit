/** Расход калорий на тренировке: WHOOP, иначе MET × вес × часы (оценка ±25 %, в интерфейсе — «≈»). */

export type SetKind = "REPS" | "TIME" | "CARDIO" | "STRETCH";

export const MET: Record<SetKind, number> = { REPS: 5, TIME: 4, CARDIO: 7, STRETCH: 2.5 };

/** Длительность в оценке не больше 3 ч: забытая и закрытая к вечеру тренировка не даёт тысячи ккал. */
export const MAX_BURN_HOURS = 3;

export type Burn = { kcal: number; source: "met" | "whoop" };

/** kinds — по элементу на выполненный рабочий подход (разминка и неотмеченные не входят). */
export function workoutKcal(i: { kinds: SetKind[]; durationSec: number | null; weightKg: number | null; whoopKcal: number | null }): Burn | null {
  if (i.whoopKcal !== null) return { kcal: i.whoopKcal, source: "whoop" };
  if (!i.kinds.length || !i.weightKg || !i.durationSec) return null;
  const met = i.kinds.reduce((sum, k) => sum + MET[k], 0) / i.kinds.length;
  const hours = Math.min(i.durationSec / 3600, MAX_BURN_HOURS);
  return { kcal: Math.round((met * i.weightKg * hours) / 5) * 5, source: "met" };
}

/** Ккал из карточки WHOOP — только при данных; «ждём», «нет совпадения», переподключение → оценка по MET. */
export function whoopKcalOf(card: { kind: string; summary?: { kcal: number | null } } | null): number | null {
  return card?.kind === "data" ? (card.summary?.kcal ?? null) : null;
}

/** Вес на местную дату: последняя запись не позже неё, иначе самая ранняя (взвесился позже первой тренировки). */
export function weightOn(entries: { date: string; weight: number }[], date: string): number | null {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const before = sorted.filter((e) => e.date <= date).at(-1);
  return (before ?? sorted[0])?.weight ?? null;
}

/**
 * XP за тренировку: уровень растёт от подходов, повторов и поднятого веса (CLAUDE.md → «Прогресс»).
 * 50 за факт тренировки + 5 за подход + 1 за 5 повторов + 1 за 200 кг объёма, но не больше MAX.
 */
const BASE_XP = 50;
const MAX_WORKOUT_XP = 600;
export const PR_XP = 25;

export function workoutXp({ sets, reps, volume }: { sets: number; reps: number; volume: number }) {
  if (sets <= 0) return 0;
  const xp = BASE_XP + sets * 5 + Math.floor(reps / 5) + Math.floor(volume / 200);
  return Math.min(MAX_WORKOUT_XP, xp);
}

/**
 * XP за тренировку: уровень растёт от подходов, повторов и поднятого веса (CLAUDE.md → «Прогресс»).
 * 50 за факт тренировки + 5 за подход + 1 за 5 повторов + 1 за 200 кг объёма + 1 за минуту на время/кардио, но не больше MAX.
 */
const BASE_XP = 50;
const MAX_WORKOUT_XP = 600;
export const PR_XP = 25;

/** + 1 за минуту работы в подходах на время и кардио (`workSec`). */
export function workoutXp({ sets, reps, volume, workSec = 0 }: { sets: number; reps: number; volume: number; workSec?: number }) {
  if (sets <= 0) return 0;
  const xp = BASE_XP + sets * 5 + Math.floor(reps / 5) + Math.floor(volume / 200) + Math.floor(workSec / 60);
  return Math.min(MAX_WORKOUT_XP, xp);
}

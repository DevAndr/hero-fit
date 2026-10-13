import { achievementCoins, COIN_RATES, levelCoins, recordCoins } from "@/lib/shop/coins";

export type RetroInput = {
  /** Завершённые тренировки с 3+ рабочими подходами по местным дням. */
  workoutsPerDay: { day: string; workouts: number }[];
  /** По тренировке — сколько разных упражнений с побитым рекордом. */
  recordExercisesPerWorkout: number[];
  /** `xpReward` полученных ачивок. */
  achievementXp: number[];
  /** Уровень на момент начала подсчёта монет. */
  level: number;
};

/** Стартовый баланс по истории до включения монет: те же ставки, что у обычных начислений, итог не больше `retroCap`. */
export function retroCoins(input: RetroInput): number {
  let total = 0;
  for (const d of input.workoutsPerDay) total += Math.min(d.workouts, COIN_RATES.workoutsPerDay) * COIN_RATES.workout;
  for (const n of input.recordExercisesPerWorkout) total += recordCoins(n);
  for (const xp of input.achievementXp) total += achievementCoins(xp);
  for (let level = 2; level <= input.level; level++) total += levelCoins(level);
  return Math.min(total, COIN_RATES.retroCap);
}

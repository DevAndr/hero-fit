/** Ставки монет (спека 2026-10-13-cosmetics-shop). Чистые функции — без server-only, их читает и клиент. */
export const COIN_RATES = {
  workout: 10,
  workoutsPerDay: 2,
  minWorkingSets: 3,
  record: 5,
  recordsPerWorkout: 3,
  dailyChest: 2,
  dailyChestRare: 6,
  bossChest: 30,
  raidChest: 40,
  raidChestMvp: 60,
  goalChest: 25,
  clubTaskChest: 15,
  retroCap: 3000,
} as const;

/** Тренировка: от 3 выполненных рабочих подходов, оплачиваются не больше 2 тренировок за местный день. */
export function workoutCoins(workingSets: number, paidToday: number): number {
  if (workingSets < COIN_RATES.minWorkingSets || paidToday >= COIN_RATES.workoutsPerDay) return 0;
  return COIN_RATES.workout;
}

/** Побитые рекорды: за упражнение, до 3 на тренировку. */
export function recordCoins(recordExercises: number): number {
  return Math.min(Math.max(recordExercises, 0), COIN_RATES.recordsPerWorkout) * COIN_RATES.record;
}

/** Ачивка: XP / 5, от 3 до 50. */
export function achievementCoins(xpReward: number): number {
  return Math.min(50, Math.max(3, Math.round(xpReward / 5)));
}

/** Засчитанная неделя серии: 10 + 2 × длина серии, не больше 30. */
export function streakWeekCoins(streak: number): number {
  return Math.min(30, 10 + 2 * streak);
}

/** Новый уровень: 20 + 2 × N. */
export function levelCoins(level: number): number {
  return 20 + 2 * level;
}

/** Монеты за каждый достигнутый уровень между `levelBefore` (не включая) и `levelAfter`. */
export function levelUpCoins(levelBefore: number, levelAfter: number): { level: number; amount: number }[] {
  const out: { level: number; amount: number }[] = [];
  for (let level = levelBefore + 1; level <= levelAfter; level++) out.push({ level, amount: levelCoins(level) });
  return out;
}

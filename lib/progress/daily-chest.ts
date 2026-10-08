/** Ежедневный сундук: награда за первый вход в календарный день (`openDailyChestAction`). */

export const RARE_CHEST_CHANCE = 0.05;
const RARE_MULTIPLIER = 3;
const MAX_BONUS = 5;

export type ChestReward = { base: number; bonus: number; rare: boolean; amount: number };

/**
 * База — 5 XP в первый день серии входов, +1 за каждый следующий, потолок 10;
 * сверху случайный бонус 0…5, «редкий сундук» (5 %) — всё ×3. Итого 5…45 XP.
 */
export function chestReward(loginStreak: number, random: () => number = Math.random): ChestReward {
  const base = Math.min(5 + Math.max(loginStreak, 1) - 1, 10);
  const bonus = Math.floor(random() * (MAX_BONUS + 1));
  const rare = random() < RARE_CHEST_CHANCE;
  return { base, bonus, rare, amount: (base + bonus) * (rare ? RARE_MULTIPLIER : 1) };
}

/**
 * Кривая уровней: переход L → L+1 стоит 100 · L^1.3 XP (округление до десятков).
 * L1→2: 100, L5→6: 810, L10→11: 2000, L20→21: 4910.
 */
export function xpToNextLevel(level: number) {
  return Math.round((100 * Math.pow(level, 1.3)) / 10) * 10;
}

export type LevelProgress = {
  level: number;
  /** XP, набранный внутри текущего уровня. */
  current: number;
  /** Сколько XP нужно на текущий уровень целиком. */
  required: number;
  percent: number;
};

export function levelProgress(totalXp: number): LevelProgress {
  let rest = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (rest >= xpToNextLevel(level)) {
    rest -= xpToNextLevel(level);
    level++;
  }
  const required = xpToNextLevel(level);
  return { level, current: rest, required, percent: Math.floor((rest / required) * 100) };
}

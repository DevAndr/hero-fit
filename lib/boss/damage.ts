/** Урон боссу недели и его здоровье (спека: docs/superpowers/specs/2026-10-08-weekly-boss-design.md). */

export const SET_DAMAGE = 100;
/** Подход до отказа (RIR 0–1). */
export const FAILURE_BONUS = 50;
/** За каждое упражнение тренировки с побитым рекордом. */
export const CRIT_DAMAGE = 100;
export const MIN_HP = 1500;
/** Сколько прошлых недель с тренировками усредняется для HP. */
const HP_WEEKS = 4;
const HP_FACTOR = 1.1;

/** Урон одного выполненного рабочего подхода. */
export function setDamage(rir: number | null): number {
  return SET_DAMAGE + (rir !== null && rir <= 1 ? FAILURE_BONUS : 0);
}

export function workoutDamage(sets: { rir: number | null }[], critExercises: number) {
  return {
    damage: sets.reduce((sum, s) => sum + setDamage(s.rir), 0) + critExercises * CRIT_DAMAGE,
    crits: critExercises,
  };
}

/** HP босса: средний урон последних недель с тренировками (от ближней к дальней) × 1,1, до сотни, не меньше MIN_HP. */
export function bossHp(pastWeeklyDamage: number[]): number {
  const weeks = pastWeeklyDamage.filter((d) => d > 0).slice(0, HP_WEEKS);
  if (!weeks.length) return MIN_HP;
  const avg = weeks.reduce((a, b) => a + b, 0) / weeks.length;
  return Math.max(MIN_HP, Math.round((avg * HP_FACTOR) / 100) * 100);
}

export function rewardXp(hp: number): number {
  return Math.round(hp / 20);
}

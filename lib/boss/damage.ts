/** Урон боссу недели и его здоровье (спека: docs/superpowers/specs/2026-10-08-weekly-boss-design.md). */

export const SET_DAMAGE = 100;
/** Подход до отказа (RIR 0–1). */
export const FAILURE_BONUS = 50;
/** За каждое упражнение тренировки с побитым рекордом. */
export const CRIT_DAMAGE = 100;
/** ≈ 3 тренировки по 10 подходов — порог для новичка. */
export const MIN_HP = 3000;
/** Сколько прошлых недель с тренировками усредняется для HP. */
const HP_WEEKS = 4;
const HP_FACTOR = 1.1;
/** Босс не слабее стольких средних тренировок — цель недели серии (STREAK_WEEK_TARGET), одной не победить. */
const HP_WORKOUTS = 3;

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

export type WeekDamage = { damage: number; workouts: number };

/**
 * HP босса по прошлым неделям (от ближней к дальней): берутся 4 ближние недели с уроном,
 * max(средняя неделя, средняя тренировка × 3) × 1,1, до сотни, не меньше MIN_HP.
 */
export function bossHp(pastWeeks: WeekDamage[]): number {
  const weeks = pastWeeks.filter((w) => w.damage > 0).slice(0, HP_WEEKS);
  if (!weeks.length) return MIN_HP;
  const damage = weeks.reduce((a, w) => a + w.damage, 0);
  const workouts = weeks.reduce((a, w) => a + w.workouts, 0);
  const base = Math.max(damage / weeks.length, (damage / Math.max(1, workouts)) * HP_WORKOUTS);
  return Math.max(MIN_HP, Math.round((base * HP_FACTOR) / 100) * 100);
}

export function rewardXp(hp: number): number {
  return Math.round(hp / 20);
}

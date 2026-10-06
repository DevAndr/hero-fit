import type { AchievementCategory } from "@/generated/prisma/enums";

/**
 * Ачивки генерируются динамически из статистики пользователя: никакого справочника в БД —
 * только правила. Код уникален в рамках пользователя и не меняется (по нему не выдаём дважды).
 */
export type AchievementDef = {
  code: string;
  category: AchievementCategory;
  title: string;
  description: string;
  threshold: number;
  exerciseId?: string;
  xpReward: number;
};

export type ExerciseStats = {
  id: string;
  name: string;
  /** Максимальный рабочий вес в первой тренировке с этим упражнением. */
  baseline: number;
  /** Лучший рабочий вес за всё время. */
  best: number;
  /** Максимум рабочих подходов в одной тренировке. */
  maxSetsInWorkout: number;
};

export type AchievementStats = {
  workouts: number;
  longestStreak: number;
  currentStreak: number;
  loginStreak: number;
  exercises: ExerciseStats[];
};

export const WORKOUT_STEP = 5;
export const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100];
export const LOGIN_THRESHOLDS = [3, 7, 14, 30, 60, 100, 365];
export const WEIGHT_PERCENTS = [10, 25, 50, 100];
/** «Если более 4-х сделал». */
export const SETS_THRESHOLD = 5;

const WORKOUT_TITLES: Record<number, string> = {
  5: "Разогрев",
  10: "Втянулся",
  25: "Завсегдатай",
  50: "Железный характер",
  100: "Легенда зала",
};
const STREAK_TITLES: Record<number, string> = {
  3: "В ударе",
  7: "Неделя огня",
  14: "Две недели без пропусков",
  30: "Месяц в ударе",
  100: "Неостановимый",
};
const LOGIN_TITLES: Record<number, string> = { 7: "Неделя в игре", 30: "Месяц в игре", 365: "Год в игре" };

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
const workouts = (n: number) => `${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`;

/** Фиксированные пороги, после последнего — каждые `step`. */
export function thresholdsUpTo(fixed: number[], step: number, value: number) {
  const result = fixed.filter((t) => t <= value);
  for (let t = fixed.at(-1)! + step; t <= value; t += step) result.push(t);
  return result;
}

function nextThreshold(fixed: number[], step: number, value: number) {
  const fixedNext = fixed.find((t) => t > value);
  if (fixedNext) return fixedNext;
  const last = fixed.at(-1)!;
  return last + Math.ceil((value + 1 - last) / step) * step;
}

const workoutDef = (n: number): AchievementDef => ({
  code: `workouts:${n}`,
  category: "WORKOUT_COUNT",
  title: WORKOUT_TITLES[n] ?? workouts(n),
  description: `Завершить ${workouts(n)}`,
  threshold: n,
  xpReward: 20 + n,
});

const streakDef = (n: number): AchievementDef => ({
  code: `streak:${n}`,
  category: "STREAK",
  title: STREAK_TITLES[n] ?? `Streak ${days(n)}`,
  description: `Тренироваться ${days(n)} подряд`,
  threshold: n,
  xpReward: n * 5,
});

const loginDef = (n: number): AchievementDef => ({
  code: `login:${n}`,
  category: "DAILY_LOGIN",
  title: LOGIN_TITLES[n] ?? `${days(n)} подряд в приложении`,
  description: `Заходить в приложение ${days(n)} подряд`,
  threshold: n,
  xpReward: n * 2,
});

const weightDef = (e: ExerciseStats, pct: number): AchievementDef => ({
  code: `weight:${e.id}:${pct}`,
  category: "WEIGHT_PROGRESS",
  title: `${e.name}: +${pct}%`,
  description: `Поднять рабочий вес на ${pct}% от первой тренировки`,
  threshold: pct,
  exerciseId: e.id,
  xpReward: 15 + pct,
});

const setsDef = (e: ExerciseStats): AchievementDef => ({
  code: `sets:${e.id}`,
  category: "SET_VOLUME",
  title: `Сет-герой: ${e.name}`,
  description: `Сделать больше ${SETS_THRESHOLD - 1} рабочих подходов за тренировку`,
  threshold: SETS_THRESHOLD,
  exerciseId: e.id,
  xpReward: 15,
});

const progressPct = (e: ExerciseStats) => (e.baseline > 0 ? ((e.best - e.baseline) / e.baseline) * 100 : 0);

export function earnedAchievements(stats: AchievementStats): AchievementDef[] {
  const result: AchievementDef[] = [];
  for (let n = WORKOUT_STEP; n <= stats.workouts; n += WORKOUT_STEP) result.push(workoutDef(n));
  result.push(...thresholdsUpTo(STREAK_THRESHOLDS, 50, stats.longestStreak).map(streakDef));
  result.push(...thresholdsUpTo(LOGIN_THRESHOLDS, 365, stats.loginStreak).map(loginDef));
  for (const e of stats.exercises) {
    const pct = progressPct(e);
    result.push(...WEIGHT_PERCENTS.filter((p) => pct + 1e-9 >= p).map((p) => weightDef(e, p)));
    if (e.maxSetsInWorkout >= SETS_THRESHOLD) result.push(setsDef(e));
  }
  return result;
}

export type Goal = AchievementDef & { current: number; target: number; percent: number };

const goal = (def: AchievementDef, current: number, target: number): Goal => ({
  ...def,
  current: Math.round(current * 10) / 10,
  target,
  percent: Math.min(99, Math.max(0, Math.floor((current / target) * 100))),
});

/** Ближайшие неполученные ачивки по каждой категории — для прогресс-баров. Сначала самые близкие. */
export function nextGoals(stats: AchievementStats): Goal[] {
  const goals: Goal[] = [];

  const nextWorkouts = (Math.floor(stats.workouts / WORKOUT_STEP) + 1) * WORKOUT_STEP;
  goals.push(goal(workoutDef(nextWorkouts), stats.workouts, nextWorkouts));

  // Для streak показываем текущую серию: прогресс «сейчас», а не исторический максимум.
  const nextStreak = nextThreshold(STREAK_THRESHOLDS, 50, Math.max(stats.currentStreak, 0));
  goals.push(goal(streakDef(nextStreak), stats.currentStreak, nextStreak));

  const nextLogin = nextThreshold(LOGIN_THRESHOLDS, 365, stats.loginStreak);
  goals.push(goal(loginDef(nextLogin), stats.loginStreak, nextLogin));

  const weightGoals = stats.exercises
    .filter((e) => e.baseline > 0)
    .flatMap((e) => {
      const pct = progressPct(e);
      const next = WEIGHT_PERCENTS.find((p) => pct + 1e-9 < p);
      return next ? [goal(weightDef(e, next), Math.max(0, pct), next)] : [];
    })
    .sort((a, b) => b.percent - a.percent);
  if (weightGoals[0]) goals.push(weightGoals[0]);

  const setsCandidate = stats.exercises
    .filter((e) => e.maxSetsInWorkout < SETS_THRESHOLD)
    .sort((a, b) => b.maxSetsInWorkout - a.maxSetsInWorkout)[0];
  if (setsCandidate) goals.push(goal(setsDef(setsCandidate), setsCandidate.maxSetsInWorkout, SETS_THRESHOLD));

  return goals.sort((a, b) => b.percent - a.percent);
}

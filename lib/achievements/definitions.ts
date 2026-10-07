import type { AchievementCategory, MuscleGroup } from "@/generated/prisma/enums";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";

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
  /** Сколько заморозок серии даёт ачивка (сверх еженедельной). */
  freezeReward?: number;
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

export type LiftKey = "bench" | "squat" | "deadlift";

export type AchievementStats = {
  workouts: number;
  longestStreak: number;
  currentStreak: number;
  loginStreak: number;
  exercises: ExerciseStats[];
  level: number;
  /** Уже полученных ачивок. */
  achievements: number;
  // Объём
  totalVolumeKg: number;
  maxWorkoutVolumeKg: number;
  totalReps: number;
  // Рекорды (первый результат в упражнении рекордом не считается — как в XP)
  prCount: number;
  maxPrsInWorkout: number;
  /** Лучшие результаты в базовых упражнениях (встроенные жим/присед/становая). */
  lifts: Partial<Record<LiftKey, { maxWeight: number; oneRm: number }>>;
  bodyWeight: number | null;
  // Разнообразие (группа мышц — основная, первая в списке упражнения, как в статистике)
  distinctExercises: number;
  customExercises: number;
  muscleWorkouts: Partial<Record<MuscleGroup, number>>;
  maxGroupsInWeek: number;
  groupsThisWeek: number;
  // Время
  totalSec: number;
  longestWorkoutSec: number;
  expressWorkouts: number;
  earlyWorkouts: number;
  lateWorkouts: number;
  bestWeeklyRun: number;
  currentWeeklyRun: number;
  // Программы
  customTemplates: number;
  programs: { program: string; workouts: number }[];
  // Вехи
  maxGapDays: number;
  freezeSaves: number;
};

export const EMPTY_STATS: AchievementStats = {
  workouts: 0,
  longestStreak: 0,
  currentStreak: 0,
  loginStreak: 0,
  exercises: [],
  level: 1,
  achievements: 0,
  totalVolumeKg: 0,
  maxWorkoutVolumeKg: 0,
  totalReps: 0,
  prCount: 0,
  maxPrsInWorkout: 0,
  lifts: {},
  bodyWeight: null,
  distinctExercises: 0,
  customExercises: 0,
  muscleWorkouts: {},
  maxGroupsInWeek: 0,
  groupsThisWeek: 0,
  totalSec: 0,
  longestWorkoutSec: 0,
  expressWorkouts: 0,
  earlyWorkouts: 0,
  lateWorkouts: 0,
  bestWeeklyRun: 0,
  currentWeeklyRun: 0,
  customTemplates: 0,
  programs: [],
  maxGapDays: 0,
  freezeSaves: 0,
};

export const WORKOUT_STEP = 5;
export const STREAK_THRESHOLDS = [3, 7, 14, 30, 60, 100];
export const LOGIN_THRESHOLDS = [3, 7, 14, 30, 60, 100, 365];
/** Ачивка за каждые +5 кг к рабочему весу первой тренировки. */
export const WEIGHT_STEP_KG = 5;
/** «Если более 4-х сделал». */
export const SETS_THRESHOLD = 5;
export const TONNES_THRESHOLDS = [5, 10, 50, 100, 400, 1000];
export const WORKOUT_TONNES_THRESHOLDS = [5, 10, 20];
export const REPS_THRESHOLDS = [1000, 5000, 10000];
export const PR_THRESHOLDS = [1, 10, 25, 50, 100];
export const PR_DAY = 3;
export const EXERCISE_THRESHOLDS = [10, 25, 50];
export const MUSCLE_THRESHOLDS = [10, 50, 100];
export const HOURS_THRESHOLDS = [10, 50, 100, 500];
export const MARATHON_MIN = 90;
/** «Экспресс»: не дольше 30 минут и не меньше 15 рабочих подходов. */
export const EXPRESS = { maxSec: 30 * 60, minSets: 15 };
export const EARLY_HOUR = 7;
export const LATE_HOUR = 22;
export const TIME_OF_DAY_THRESHOLDS = [5, 25];
/** Неделя считается, если в ней 3+ тренировки. */
export const WEEK_MIN_WORKOUTS = 3;
export const WEEKS_THRESHOLDS = [4, 8, 12, 26, 52];
export const PROGRAM_THRESHOLDS = [10, 25, 50];
export const LEVEL_THRESHOLDS = [5, 10, 25, 50];
export const COLLECTOR_THRESHOLDS = [10, 25, 50, 100];
export const COMEBACK_DAYS = 14;

/** Встроенные базовые упражнения (по названию из сида, userId = null). */
export const LIFTS: Record<LiftKey, { exercise: string; label: string; milestones: number[]; ratios: number[] }> = {
  bench: { exercise: "Жим штанги лёжа", label: "Жим лёжа", milestones: [60, 80, 100, 120, 140, 160], ratios: [1, 1.25, 1.5] },
  squat: { exercise: "Приседания со штангой", label: "Присед", milestones: [80, 100, 140, 180, 220], ratios: [1.5, 2] },
  deadlift: { exercise: "Становая тяга", label: "Становая", milestones: [100, 140, 180, 220, 260], ratios: [2, 2.5] },
};

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
const TONNES_TITLES: Record<number, string> = {
  5: "Поднял слона",
  10: "Поднял автобус",
  50: "Поднял танк",
  100: "Поднял синего кита",
  400: "Поднял Boeing 747",
  1000: "Тысяча тонн",
};
const WORKOUT_TONNES_TITLES: Record<number, string> = { 5: "Тяжёлый день", 10: "Грузчик", 20: "Подъёмный кран" };

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
const workouts = (n: number) => `${n} ${plural(n, "тренировка", "тренировки", "тренировок")}`;
const number = (n: number) => n.toLocaleString("ru-RU");
const ratioText = (n: number) => `×${number(n)}`;

const EPS = 1e-9;

/** Фиксированные пороги, после последнего — каждые `step` (без шага — только фиксированные). */
export function thresholdsUpTo(fixed: number[], step: number | undefined, value: number) {
  const result = fixed.filter((t) => t <= value + EPS);
  if (step) for (let t = (fixed.at(-1) ?? 0) + step; t <= value + EPS; t += step) result.push(t);
  return result;
}

function nextThreshold(fixed: number[], step: number | undefined, value: number) {
  const fixedNext = fixed.find((t) => t > value + EPS);
  if (fixedNext !== undefined) return fixedNext;
  if (!step) return undefined;
  const last = fixed.at(-1) ?? 0;
  return last + (Math.floor((value + EPS - last) / step) + 1) * step;
}

/**
 * Серия недель подряд, в каждой из которых 3+ тренировки. `weeks` — понедельники таких недель
 * («YYYY-MM-DD»), `currentWeek` — понедельник текущей. Текущая серия жива, пока она доходит
 * до текущей или прошлой недели (текущая ещё не закончилась).
 */
export function weeklyRuns(weeks: string[], currentWeek: string): { best: number; current: number } {
  const WEEK_MS = 7 * 24 * 3600 * 1000;
  const index = (key: string) => Math.round(Date.parse(`${key}T00:00:00Z`) / WEEK_MS);
  const sorted = [...new Set(weeks.map(index))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (const [i, w] of sorted.entries()) {
    run = i > 0 && w === sorted[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const last = sorted.at(-1);
  const now = index(currentWeek);
  return { best, current: last !== undefined && now - last <= 1 ? run : 0 };
}

// ───────────────────────────── Лестницы порогов ─────────────────────────────

/**
 * Одна «лестница» — серия ачивок по одной метрике: получены все пороги ≤ value,
 * целью показывается ближайший следующий (прогресс по goalValue, по умолчанию — value).
 */
type Ladder = {
  fixed: number[];
  step?: number;
  value: number;
  goalValue?: number;
  def: (n: number) => AchievementDef;
  unit?: string;
  /** false — не показывать цель (разовые ачивки «да/нет»). */
  goal?: boolean;
  /** Цели одной группы (напр. по разным упражнениям) — показывается только ближайшая. */
  goalGroup?: string;
};

type DefInput = Omit<AchievementDef, "threshold">;
const def = (n: number, d: DefInput): AchievementDef => ({
  ...d,
  threshold: n,
  description: d.freezeReward ? `${d.description} · награда: заморозка серии` : d.description,
});

const workoutDef = (n: number) =>
  def(n, {
    code: `workouts:${n}`,
    category: "WORKOUT_COUNT",
    title: WORKOUT_TITLES[n] ?? workouts(n),
    description: `Завершить ${workouts(n)}`,
    xpReward: 20 + n,
  });

const streakDef = (n: number) =>
  def(n, {
    code: `streak:${n}`,
    category: "STREAK",
    title: STREAK_TITLES[n] ?? `Streak ${days(n)}`,
    description: `Тренироваться ${days(n)} подряд`,
    xpReward: n * 5,
    freezeReward: n >= 7 ? 1 : undefined,
  });

const loginDef = (n: number) =>
  def(n, {
    code: `login:${n}`,
    category: "DAILY_LOGIN",
    title: LOGIN_TITLES[n] ?? `${days(n)} подряд в приложении`,
    description: `Заходить в приложение ${days(n)} подряд`,
    xpReward: n * 2,
    freezeReward: n >= 30 ? 1 : undefined,
  });

function exerciseLadders(e: ExerciseStats): Ladder[] {
  return [
    {
      fixed: [],
      step: WEIGHT_STEP_KG,
      value: Math.max(0, e.best - e.baseline),
      unit: " кг",
      goal: e.best > 0,
      goalGroup: "weight",
      // Префикс отличается от прежних процентных `weight:<id>:<pct>`, чтобы коды не пересекались.
      def: (kg) =>
        def(kg, {
          code: `weightkg:${e.id}:${kg}`,
          category: "WEIGHT_PROGRESS",
          title: `${e.name}: +${kg} кг`,
          description: `Поднять рабочий вес на ${kg} кг больше, чем в первой тренировке`,
          exerciseId: e.id,
          xpReward: 15 + kg,
        }),
    },
    {
      fixed: [SETS_THRESHOLD],
      value: e.maxSetsInWorkout,
      goalGroup: "sets",
      def: (n) =>
        def(n, {
          code: `sets:${e.id}`,
          category: "SET_VOLUME",
          title: `Сет-герой: ${e.name}`,
          description: `Сделать больше ${SETS_THRESHOLD - 1} рабочих подходов за тренировку`,
          exerciseId: e.id,
          xpReward: 15,
        }),
    },
  ];
}

function strengthLadders(s: AchievementStats): Ladder[] {
  return (Object.keys(LIFTS) as LiftKey[]).flatMap((key) => {
    const lift = LIFTS[key];
    const best = s.lifts[key];
    const ladders: Ladder[] = [
      {
        fixed: lift.milestones,
        value: best?.maxWeight ?? 0,
        unit: " кг",
        goalGroup: "lift",
        def: (kg) =>
          def(kg, {
            code: `lift:${key}:${kg}`,
            category: "STRENGTH",
            title: kg === 100 ? `Клуб сотки: ${lift.label.toLowerCase()}` : `${lift.label}: ${kg} кг`,
            description: `Выполнить рабочий подход с весом ${kg} кг в упражнении «${lift.exercise}»`,
            xpReward: 20 + kg / 5,
          }),
      },
    ];
    if (s.bodyWeight) {
      // Порог хранится в сотых (threshold — целое): 125 = ×1,25 веса тела.
      ladders.push({
        fixed: lift.ratios.map((r) => Math.round(r * 100)),
        value: best ? (best.oneRm / s.bodyWeight) * 100 : 0,
        unit: "%",
        goalGroup: "bodyweight",
        def: (pct) =>
          def(pct, {
            code: `bwratio:${key}:${pct}`,
            category: "STRENGTH",
            title: `${lift.label}: ${ratioText(pct / 100)} веса тела`,
            description: `Расчётный 1RM в упражнении «${lift.exercise}» — не меньше ${ratioText(pct / 100)} от веса тела`,
            xpReward: Math.round(pct / 2),
          }),
      });
    }
    return ladders;
  });
}

function ladders(s: AchievementStats): Ladder[] {
  const tonnes = s.totalVolumeKg / 1000;
  const single = (code: string, category: AchievementCategory, title: string, description: string, xpReward: number) =>
    (n: number) => def(n, { code: `${code}:${n}`, category, title, description, xpReward });

  return [
    { fixed: [WORKOUT_STEP], step: WORKOUT_STEP, value: s.workouts, def: workoutDef },
    // Получение — по максимальной серии (сохраняется после перерыва), цель — по текущей.
    { fixed: STREAK_THRESHOLDS, step: 50, value: s.longestStreak, goalValue: s.currentStreak, def: streakDef },
    { fixed: LOGIN_THRESHOLDS, step: 365, value: s.loginStreak, def: loginDef },
    ...s.exercises.flatMap(exerciseLadders),

    // Объём
    {
      fixed: TONNES_THRESHOLDS,
      step: 1000,
      value: tonnes,
      unit: " т",
      def: (n) =>
        def(n, {
          code: `volume:${n}`,
          category: "VOLUME",
          title: TONNES_TITLES[n] ?? `${number(n)} т за всё время`,
          description: `Поднять ${number(n)} т суммарно за все тренировки`,
          xpReward: Math.round(20 + n / 10),
        }),
    },
    {
      fixed: WORKOUT_TONNES_THRESHOLDS,
      value: s.maxWorkoutVolumeKg / 1000,
      unit: " т",
      def: (n) =>
        def(n, {
          code: `workoutvolume:${n}`,
          category: "VOLUME",
          title: WORKOUT_TONNES_TITLES[n] ?? `${n} т за тренировку`,
          description: `Поднять ${n} т за одну тренировку`,
          xpReward: 10 + n * 2,
        }),
    },
    {
      fixed: REPS_THRESHOLDS,
      step: 10000,
      value: s.totalReps,
      def: (n) =>
        def(n, {
          code: `reps:${n}`,
          category: "VOLUME",
          title: `${number(n)} повторений`,
          description: `Сделать ${number(n)} повторений за всё время`,
          xpReward: Math.round(20 + n / 200),
        }),
    },

    // Рекорды
    {
      fixed: PR_THRESHOLDS,
      step: 100,
      value: s.prCount,
      def: (n) =>
        def(n, {
          code: `records:${n}`,
          category: "RECORDS",
          title: n === 1 ? "Первый рекорд" : `${n} ${plural(n, "рекорд", "рекорда", "рекордов")}`,
          description: n === 1 ? "Побить личный рекорд" : `Побить личные рекорды ${n} раз`,
          xpReward: 10 + n * 2,
        }),
    },
    {
      fixed: [PR_DAY],
      value: s.maxPrsInWorkout,
      goal: false,
      def: single("prday", "RECORDS", "Рекордный день", `Побить ${PR_DAY} личных рекорда за одну тренировку`, 40),
    },

    ...strengthLadders(s),

    // Разнообразие
    {
      fixed: EXERCISE_THRESHOLDS,
      value: s.distinctExercises,
      def: (n) =>
        def(n, {
          code: `exercises:${n}`,
          category: "VARIETY",
          title: `Разнообразие: ${n} ${plural(n, "упражнение", "упражнения", "упражнений")}`,
          description: `Выполнить ${n} разных упражнений`,
          xpReward: 10 + n,
        }),
    },
    ...MUSCLE_GROUPS.map(
      (group): Ladder => ({
        fixed: MUSCLE_THRESHOLDS,
        value: s.muscleWorkouts[group] ?? 0,
        goalGroup: "muscle",
        def: (n) =>
          def(n, {
            code: `muscle:${group}:${n}`,
            category: "VARIETY",
            title: `${MUSCLE_GROUP_LABELS[group]}: ${workouts(n)}`,
            description: `Провести ${workouts(n)} с упражнениями на группу «${MUSCLE_GROUP_LABELS[group]}»`,
            xpReward: 10 + n / 2,
          }),
      }),
    ),
    {
      fixed: [MUSCLE_GROUPS.length],
      value: s.maxGroupsInWeek,
      goalValue: s.groupsThisWeek,
      def: (n) =>
        def(n, {
          code: `allgroups:${n}`,
          category: "VARIETY",
          title: "Без слабых мест",
          description: `Проработать все ${n} групп мышц за одну календарную неделю`,
          xpReward: 50,
        }),
    },
    {
      fixed: [1],
      value: s.customExercises,
      goal: false,
      def: single("custom-exercise", "VARIETY", "Изобретатель", "Создать своё упражнение", 15),
    },

    // Время
    {
      fixed: HOURS_THRESHOLDS,
      step: 500,
      value: s.totalSec / 3600,
      unit: " ч",
      def: (n) =>
        def(n, {
          code: `hours:${n}`,
          category: "TIME",
          title: `${n} ${plural(n, "час", "часа", "часов")} в зале`,
          description: `Провести на тренировках ${n} ч суммарно`,
          xpReward: Math.round(20 + n / 2),
        }),
    },
    {
      fixed: [MARATHON_MIN],
      value: s.longestWorkoutSec / 60,
      goal: false,
      def: (n) =>
        def(n, {
          code: `marathon:${n}`,
          category: "TIME",
          title: "Марафонец",
          description: `Тренироваться ${n} минут и дольше за раз`,
          xpReward: 30,
        }),
    },
    {
      fixed: [1],
      value: s.expressWorkouts,
      goal: false,
      def: single(
        "express",
        "TIME",
        "Экспресс",
        `${EXPRESS.minSets}+ рабочих подходов за тренировку не дольше ${EXPRESS.maxSec / 60} минут`,
        30,
      ),
    },
    {
      fixed: TIME_OF_DAY_THRESHOLDS,
      value: s.earlyWorkouts,
      goal: false,
      def: (n) =>
        def(n, {
          code: `early:${n}`,
          category: "TIME",
          title: n === TIME_OF_DAY_THRESHOLDS[0] ? "Жаворонок" : `Жаворонок: ${workouts(n)}`,
          description: `Начать ${workouts(n)} до ${EARLY_HOUR}:00`,
          xpReward: 20 + n,
        }),
    },
    {
      fixed: TIME_OF_DAY_THRESHOLDS,
      value: s.lateWorkouts,
      goal: false,
      def: (n) =>
        def(n, {
          code: `late:${n}`,
          category: "TIME",
          title: n === TIME_OF_DAY_THRESHOLDS[0] ? "Сова" : `Сова: ${workouts(n)}`,
          description: `Начать ${workouts(n)} после ${LATE_HOUR}:00`,
          xpReward: 20 + n,
        }),
    },
    {
      fixed: WEEKS_THRESHOLDS,
      step: 52,
      value: s.bestWeeklyRun,
      goalValue: s.currentWeeklyRun,
      def: (n) =>
        def(n, {
          code: `weeks:${n}`,
          category: "TIME",
          title: `Стабильность: ${n} ${plural(n, "неделя", "недели", "недель")}`,
          description: `Тренироваться ${WEEK_MIN_WORKOUTS}+ раза в неделю ${n} ${plural(n, "неделю", "недели", "недель")} подряд`,
          xpReward: n * 5,
          freezeReward: 1,
        }),
    },

    // Программы
    {
      fixed: [1],
      value: s.customTemplates,
      goal: false,
      def: single("template", "PROGRAMS", "Своя программа", "Создать свой шаблон тренировки", 15),
    },
    ...s.programs.map(
      ({ program, workouts: n }): Ladder => ({
        fixed: PROGRAM_THRESHOLDS,
        value: n,
        goalGroup: "program",
        def: (t) =>
          def(t, {
            code: `program:${program}:${t}`,
            category: "PROGRAMS",
            title: `${program}: ${workouts(t)}`,
            description: `Провести ${workouts(t)} по готовой программе «${program}»`,
            xpReward: 20 + t,
          }),
      }),
    ),

    // Вехи
    {
      fixed: LEVEL_THRESHOLDS,
      step: 25,
      value: s.level,
      def: (n) =>
        def(n, {
          code: `level:${n}`,
          category: "MILESTONE",
          title: `Уровень ${n}`,
          description: `Достичь ${n} уровня`,
          xpReward: n * 10,
        }),
    },
    {
      fixed: COLLECTOR_THRESHOLDS,
      step: 50,
      value: s.achievements,
      def: (n) =>
        def(n, {
          code: `collector:${n}`,
          category: "MILESTONE",
          title: `Коллекционер: ${n}`,
          description: `Получить ${n} ${plural(n, "ачивку", "ачивки", "ачивок")}`,
          xpReward: n,
        }),
    },
    {
      fixed: [COMEBACK_DAYS],
      value: s.maxGapDays,
      goal: false,
      def: single("comeback", "MILESTONE", "Феникс", `Вернуться к тренировкам после перерыва в ${COMEBACK_DAYS}+ дней`, 30),
    },
    {
      fixed: [1],
      value: s.freezeSaves,
      goal: false,
      def: single("freeze", "MILESTONE", "Второе дыхание", "Сохранить streak с помощью заморозки", 20),
    },
  ];
}

export function earnedAchievements(stats: AchievementStats): AchievementDef[] {
  return ladders(stats).flatMap((l) => thresholdsUpTo(l.fixed, l.step, l.value).map(l.def));
}

export type Goal = AchievementDef & { current: number; target: number; percent: number; unit: string };

/** Ближайшие неполученные ачивки по каждой лестнице (группе) — для прогресс-баров. Сначала самые близкие. */
export function nextGoals(stats: AchievementStats): Goal[] {
  const best = new Map<string, Goal>();
  for (const [i, l] of ladders(stats).entries()) {
    if (l.goal === false) continue;
    const current = Math.max(0, l.goalValue ?? l.value);
    const target = nextThreshold(l.fixed, l.step, current);
    if (target === undefined) continue;
    const g: Goal = {
      ...l.def(target),
      current: Math.round(current * 10) / 10,
      target,
      percent: Math.min(99, Math.max(0, Math.floor((current / target) * 100))),
      unit: l.unit ?? "",
    };
    const key = l.goalGroup ?? String(i);
    const prev = best.get(key);
    if (!prev || g.percent > prev.percent) best.set(key, g);
  }
  return [...best.values()].sort((a, b) => b.percent - a.percent);
}

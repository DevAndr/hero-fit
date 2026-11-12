/** «Первый удар»: мини-тренировка новичка после регистрации. Чистые правила. */

export const FIRST_STRIKE_DAMAGE = 100;
export const FIRST_STRIKE_XP = 30;

export type StrikeExercise = "squat" | "pushup" | "plank";

export const STRIKE_EXERCISES: readonly {
  code: StrikeExercise;
  label: string;
  unit: "reps" | "sec";
  defaultValue: number;
}[] = [
  { code: "squat", label: "Приседания", unit: "reps", defaultValue: 10 },
  { code: "pushup", label: "Отжимания", unit: "reps", defaultValue: 10 },
  { code: "plank", label: "Планка", unit: "sec", defaultValue: 30 },
];

/** Удар доступен один раз и только до первой завершённой тренировки. */
export function canStrike(p: {
  flag: boolean;
  firstStrikeAt: Date | null;
  completedWorkouts: number;
}): boolean {
  return p.flag && p.firstStrikeAt === null && p.completedWorkouts === 0;
}

const RANGES = {
  reps: { min: 1, max: 200, error: "Повторов — от 1 до 200" },
  sec: { min: 5, max: 600, error: "Секунд — от 5 до 600" },
} as const;

export function parseStrike(
  exercise: unknown,
  value: unknown,
):
  | { ok: true; exercise: StrikeExercise; value: number }
  | { ok: false; error: string } {
  const def = STRIKE_EXERCISES.find((e) => e.code === exercise);
  if (!def) return { ok: false, error: "Выберите упражнение" };
  const range = RANGES[def.unit];
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isInteger(n) || n < range.min || n > range.max) {
    return { ok: false, error: range.error };
  }
  return { ok: true, exercise: def.code, value: n };
}

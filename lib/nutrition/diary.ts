/** Дневник питания (спека 2026-10-31-nutrition-diary): приёмы пищи, итоги дня, разбор даты из адреса. */
import { addDays } from "@/lib/dates";

export type Meal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

export const MEALS: Meal[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
export const MEAL_LABELS: Record<Meal, string> = { BREAKFAST: "Завтрак", LUNCH: "Обед", DINNER: "Ужин", SNACK: "Перекус" };

/** Приём по местному часу — для общей кнопки «Добавить». */
export function defaultMeal(hour: number): Meal {
  if (hour < 11) return "BREAKFAST";
  if (hour < 16) return "LUNCH";
  if (hour < 21) return "DINNER";
  return "SNACK";
}

export type Macros = { kcal: number; protein: number; fat: number; carbs: number };
type EntryMacros = { meal: Meal; kcal: number; protein: number | null; fat: number | null; carbs: number | null };

const zero = (): Macros => ({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Суммы за день и по приёмам: Б/Ж/У без значения — 0, граммы до 0,1. */
export function dayTotals(entries: EntryMacros[]): { total: Macros; byMeal: Record<Meal, Macros> } {
  const total = zero();
  const byMeal = Object.fromEntries(MEALS.map((m) => [m, zero()])) as Record<Meal, Macros>;
  for (const e of entries) {
    for (const acc of [total, byMeal[e.meal]]) {
      acc.kcal += e.kcal;
      acc.protein += e.protein ?? 0;
      acc.fat += e.fat ?? 0;
      acc.carbs += e.carbs ?? 0;
    }
  }
  for (const acc of [total, ...Object.values(byMeal)]) {
    acc.protein = round1(acc.protein);
    acc.fat = round1(acc.fat);
    acc.carbs = round1(acc.carbs);
  }
  return { total, byMeal };
}

export function balance(eaten: number, norm: number): { left: number } | { over: number } {
  return eaten <= norm ? { left: norm - eaten } : { over: eaten - norm };
}

/** Кольцо калорий: main — доля съеденного от нормы (до полного круга), over — превышение (второй круг, тоже до полного). */
export function ringArcs(eaten: number, norm: number): { main: number; over: number } {
  if (norm <= 0) return { main: 0, over: 0 };
  return { main: Math.min(1, eaten / norm), over: Math.min(1, Math.max(0, eaten - norm) / norm) };
}

export const MAX_DIARY_DAYS = 365;

/** День из `?date=`: мусор и будущее → сегодня, старше года → граница года. */
export function parseDiaryDate(raw: string | string[] | undefined, today: string): string {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw || raw > today) return today;
  const oldest = addDays(today, -MAX_DIARY_DAYS);
  return raw < oldest ? oldest : raw;
}

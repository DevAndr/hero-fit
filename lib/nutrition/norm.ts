/** Дневная норма калорий и БЖУ (спека 2026-10-31-nutrition-norm): Миффлин–Сан Жеор × активность × цель. */

export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "HIGH" | "VERY_HIGH";
export type NutritionGoal = "LOSE" | "MAINTAIN" | "GAIN";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = { SEDENTARY: 1.2, LIGHT: 1.375, MODERATE: 1.55, HIGH: 1.725, VERY_HIGH: 1.9 };
export const GOAL_FACTORS: Record<NutritionGoal, number> = { LOSE: 0.85, MAINTAIN: 1, GAIN: 1.1 };

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; hint: string }> = {
  SEDENTARY: { label: "Сидячая", hint: "почти без движения" },
  LIGHT: { label: "Лёгкая", hint: "1–3 тренировки в неделю" },
  MODERATE: { label: "Средняя", hint: "3–5 тренировок в неделю" },
  HIGH: { label: "Высокая", hint: "6–7 тренировок в неделю" },
  VERY_HIGH: { label: "Очень высокая", hint: "тяжёлый физический труд или 2 тренировки в день" },
};
export const GOAL_LABELS: Record<NutritionGoal, string> = { LOSE: "Похудение", MAINTAIN: "Поддержание", GAIN: "Набор" };

const MIN_KCAL = { MALE: 1500, FEMALE: 1200 } as const;

export type NormInput = {
  gender: "MALE" | "FEMALE" | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: ActivityLevel | null;
  goal: NutritionGoal | null;
};

export type Norm = { kcal: number; protein: number; fat: number; carbs: number; bmr: number; factor: number; goalPct: number };

export function dailyNorm(i: NormInput, year: number): Norm | null {
  const { gender, birthYear, heightCm, weightKg, activity, goal } = i;
  if (!gender || birthYear === null || heightCm === null || weightKg === null || !activity || !goal) return null;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * (year - birthYear) + (gender === "MALE" ? 5 : -161);
  const factor = ACTIVITY_FACTORS[activity];
  const kcal = Math.round(Math.max(MIN_KCAL[gender], bmr * factor * GOAL_FACTORS[goal]) / 10) * 10;
  const protein = Math.round((goal === "LOSE" ? 2 : 1.8) * weightKg);
  const fat = Math.round(0.9 * weightKg);
  const carbs = Math.max(0, Math.round((kcal - 4 * protein - 9 * fat) / 4));
  return { kcal, protein, fat, carbs, bmr: Math.round(bmr), factor, goalPct: Math.round((GOAL_FACTORS[goal] - 1) * 100) };
}

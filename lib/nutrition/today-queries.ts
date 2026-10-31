import "server-only";
import { dayKey } from "@/lib/daily-login";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { weightOn } from "@/lib/nutrition/burn";
import { dailyNorm } from "@/lib/nutrition/norm";
import { diaryStreak } from "@/lib/nutrition/streak";
import { diaryDays } from "@/lib/nutrition/streak-queries";

export type NutritionToday = { eaten: number; normKcal: number | null; streak: number; recent: boolean };

/** Карточка «Питание сегодня» на дашборде: съедено сегодня, норма, текущая серия, были ли записи за 7 дней. */
export async function getNutritionToday(userId: string, tz: string, now: Date): Promise<NutritionToday> {
  const today = dayKey(now, tz);
  const [eaten, recent, days, user, weights] = await Promise.all([
    db.foodEntry.aggregate({ where: { userId, date: today }, _sum: { kcal: true } }),
    db.foodEntry.count({ where: { userId, date: { gte: addDays(today, -6) } } }),
    diaryDays(db, userId, today),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { gender: true, birthYear: true, heightCm: true, activityLevel: true, nutritionGoal: true } }),
    db.bodyWeightEntry.findMany({ where: { userId }, select: { date: true, weight: true } }),
  ]);
  const norm = dailyNorm(
    { gender: user.gender, birthYear: user.birthYear, heightCm: user.heightCm, weightKg: weightOn(weights, today), activity: user.activityLevel, goal: user.nutritionGoal },
    Number(today.slice(0, 4)),
  );
  return { eaten: eaten._sum.kcal ?? 0, normKcal: norm?.kcal ?? null, streak: diaryStreak(days, today).current, recent: recent > 0 };
}

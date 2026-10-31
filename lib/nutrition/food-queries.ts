import "server-only";
import type { Meal } from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";

export type FoodEntryRow = { id: string; meal: Meal; name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null };
export type RecentFood = { name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null };

const RECENT_DAYS = 30;
const RECENT_LIMIT = 8;

const entrySelect = { id: true, meal: true, name: true, kcal: true, protein: true, fat: true, carbs: true } as const;

/** Записи дня и приёмы, в которых были записи накануне (для «Повторить вчерашний»). */
export async function getDiaryDay(userId: string, date: string): Promise<{ entries: FoodEntryRow[]; yesterdayMeals: Meal[] }> {
  const [entries, yesterday] = await Promise.all([
    db.foodEntry.findMany({ where: { userId, date }, orderBy: { createdAt: "asc" }, select: entrySelect }),
    db.foodEntry.findMany({ where: { userId, date: addDays(date, -1) }, distinct: ["meal"], select: { meal: true } }),
  ]);
  return { entries, yesterdayMeals: yesterday.map((e) => e.meal) };
}

/** «Недавние»: до 8 названий без учёта регистра за 30 дней — по частоте, затем по свежести; значения из последней записи. */
export async function getRecentFoods(userId: string, today: string): Promise<RecentFood[]> {
  return db.$queryRaw<RecentFood[]>`
    SELECT name, kcal, protein, fat, carbs FROM (
      SELECT DISTINCT ON (lower(name)) name, kcal, protein, fat, carbs,
             count(*) OVER (PARTITION BY lower(name)) AS uses, "createdAt" AS last_at
      FROM "FoodEntry"
      WHERE "userId" = ${userId} AND date >= ${addDays(today, -RECENT_DAYS)}
      ORDER BY lower(name), "createdAt" DESC
    ) latest
    ORDER BY uses DESC, last_at DESC
    LIMIT ${RECENT_LIMIT}
  `;
}

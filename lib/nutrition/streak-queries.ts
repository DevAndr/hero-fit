import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dayKey } from "@/lib/daily-login";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { DIARY_DAY_MIN_KCAL, DIARY_DAY_MIN_MEALS, diaryStreak, type DiaryDay } from "@/lib/nutrition/streak";

type Client = Prisma.TransactionClient | typeof db;

const WINDOW_DAYS = 400;

/** Зачётные дни дневника за 400 дней: записи в 2+ разных приёмах и сумма от 800 ккал. */
export async function diaryDays(client: Client, userId: string, today: string): Promise<DiaryDay[]> {
  return client.$queryRaw<DiaryDay[]>`
    SELECT date, sum(kcal)::int AS kcal FROM "FoodEntry"
    WHERE "userId" = ${userId} AND date >= ${addDays(today, -WINDOW_DAYS)}
    GROUP BY date
    HAVING count(DISTINCT meal) >= ${DIARY_DAY_MIN_MEALS} AND sum(kcal) >= ${DIARY_DAY_MIN_KCAL}
  `;
}

export async function getDiaryStreak(userId: string, tz: string, now: Date): Promise<{ current: number; longest: number }> {
  const today = dayKey(now, tz);
  return diaryStreak(await diaryDays(db, userId, today), today);
}

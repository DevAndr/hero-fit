import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AchievementStats } from "@/lib/achievements/definitions";
import { dayKey } from "@/lib/daily-login";
import { flagOn } from "@/lib/flags/eval";
import { weightOn } from "@/lib/nutrition/burn";
import { dailyNorm } from "@/lib/nutrition/norm";
import { diaryStreak, normDays } from "@/lib/nutrition/streak";
import { diaryDays } from "@/lib/nutrition/streak-queries";

const OFF: AchievementStats["nutrition"] = { enabled: false, longestDiaryStreak: 0, currentDiaryStreak: 0, normDays: 0 };

/**
 * Статистика дневника для ачивок. Вызывается внутри транзакций (завершение тренировки, визит…): флаг читается тем же
 * клиентом — глобальный кэш флагов на промахе взял бы второе соединение из пула. Без флага — без запросов к дневнику.
 * Норма — текущая (истории нормы нет).
 */
export async function nutritionStats(client: Prisma.TransactionClient, userId: string, tz: string): Promise<AchievementStats["nutrition"]> {
  const flag = await client.featureFlag.findUnique({ where: { key: "nutrition" }, select: { enabled: true, percent: true, userIds: true } });
  if (!flagOn("nutrition", flag, userId)) return OFF;
  const today = dayKey(new Date(), tz);
  const [days, user, weights] = await Promise.all([
    diaryDays(client, userId, today),
    client.user.findUniqueOrThrow({ where: { id: userId }, select: { gender: true, birthYear: true, heightCm: true, activityLevel: true, nutritionGoal: true } }),
    client.bodyWeightEntry.findMany({ where: { userId }, select: { date: true, weight: true } }),
  ]);
  const norm = dailyNorm(
    { gender: user.gender, birthYear: user.birthYear, heightCm: user.heightCm, weightKg: weightOn(weights, today), activity: user.activityLevel, goal: user.nutritionGoal },
    Number(today.slice(0, 4)),
  );
  const streak = diaryStreak(days, today);
  return { enabled: true, longestDiaryStreak: streak.longest, currentDiaryStreak: streak.current, normDays: normDays(days, norm?.kcal ?? null) };
}

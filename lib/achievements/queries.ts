import "server-only";
import { isEnabled } from "@/lib/flags/server";
import type { AchievementCategory } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getAchievementStats } from "@/lib/achievements/engine";
import { nextGoals } from "@/lib/achievements/definitions";

export async function getUnseenAchievements(userId: string) {
  return db.userAchievement.findMany({
    where: { userId, seenAt: null },
    orderBy: { earnedAt: "asc" },
    select: { id: true, code: true, title: true, description: true, xpReward: true },
    take: 10,
  });
}

/** Категории целей за выключенными флагами: «Выносливость» — без workout_formats (полученные ачивки видны всегда). */
export async function hiddenGoalCategories(userId: string): Promise<{ hide: ReadonlySet<AchievementCategory> }> {
  const [formats, nutrition] = await Promise.all([isEnabled("workout_formats", userId), isEnabled("nutrition", userId)]);
  return { hide: new Set<AchievementCategory>([...(formats ? [] : (["ENDURANCE"] as const)), ...(nutrition ? [] : (["NUTRITION"] as const))]) };
}

export async function getAchievementsOverview(userId: string) {
  const [earned, stats] = await Promise.all([
    db.userAchievement.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      select: { id: true, code: true, category: true, title: true, description: true, xpReward: true, earnedAt: true },
    }),
    getAchievementStats(db, userId),
  ]);
  return { earned, goals: nextGoals(stats, await hiddenGoalCategories(userId)) };
}

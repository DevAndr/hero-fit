import "server-only";
import { db } from "@/lib/db";
import { getAchievementStats } from "@/lib/achievements/engine";
import { nextGoals } from "@/lib/achievements/definitions";

export async function getUnseenAchievements(userId: string) {
  return db.userAchievement.findMany({
    where: { userId, seenAt: null },
    orderBy: { earnedAt: "asc" },
    select: { id: true, title: true, description: true, xpReward: true },
    take: 10,
  });
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
  return { earned, goals: nextGoals(stats) };
}

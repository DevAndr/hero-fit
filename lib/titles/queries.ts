import "server-only";
import { db } from "@/lib/db";
import type { BossCode } from "@/lib/boss/bosses";
import { availableTitles, type BossWins } from "@/lib/titles/catalog";

/** Открытые титулы пользователя: из его ачивок и побед над боссами. */
export async function getAvailableTitles(userId: string) {
  const [achievements, wins] = await Promise.all([
    db.userAchievement.findMany({ where: { userId }, select: { code: true } }),
    db.bossWeek.groupBy({ by: ["bossCode"], where: { userId, defeatedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const bossWins: BossWins = Object.fromEntries(wins.map((w) => [w.bossCode as BossCode, w._count._all]));
  return availableTitles({ achievementCodes: achievements.map((a) => a.code), bossWins });
}

/** Для настроек: открытые титулы и выбранный. */
export async function getTitleSettings(userId: string) {
  const [titles, user] = await Promise.all([
    getAvailableTitles(userId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { titleCode: true } }),
  ]);
  return { titles, current: user.titleCode };
}

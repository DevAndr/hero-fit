"use server";

import { revalidatePath } from "next/cache";
import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { rewardXp } from "@/lib/boss/damage";
import { levelProgress } from "@/lib/progress/level";

/** Сундук за победу над боссом недели `week`: XP = HP / 20, забрать можно один раз. */
export async function openBossChestAction(week: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await db.$transaction(async (tx) => {
    const boss = await tx.bossWeek.findUnique({ where: { userId_week: { userId: user.id, week } } });
    if (!boss?.defeatedAt) return { ok: false as const, error: "Босс ещё не повержен" };
    // Условие по rewardOpenedAt — второй клик или вторая вкладка не заберут сундук дважды
    const { count } = await tx.bossWeek.updateMany({
      where: { id: boss.id, rewardOpenedAt: null },
      data: { rewardOpenedAt: new Date() },
    });
    if (count === 0) return { ok: false as const, error: "Сундук босса уже открыт" };

    const amount = rewardXp(boss.hp);
    await tx.xpEvent.create({
      data: { userId: user.id, amount, reason: XpReason.BOSS_REWARD, meta: { week, code: boss.bossCode } },
    });
    const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: amount } }, select: { xp: true } });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

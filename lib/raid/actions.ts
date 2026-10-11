"use server";

import { revalidatePath } from "next/cache";
import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { levelProgress } from "@/lib/progress/level";
import { chestOpenable } from "@/lib/raid/rules";

/** Сундук рейда: только своя награда, только состоя в гильдии рейда и не позже 4 недель после победы; один раз. */
export async function openRaidChestAction(raidId: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await db.$transaction(async (tx) => {
    const reward = await tx.raidReward.findUnique({
      where: { raidId_userId: { raidId, userId: user.id } },
      include: { raid: { select: { guildId: true, bossCode: true, defeatedAt: true } } },
    });
    const member = await tx.guildMember.findUnique({ where: { userId: user.id }, select: { guildId: true } });
    if (!reward || !reward.raid.defeatedAt || member?.guildId !== reward.raid.guildId || !chestOpenable(reward.raid.defeatedAt, new Date())) {
      return { ok: false as const, error: "Сундук недоступен" };
    }
    // Условие по openedAt — второй клик или вторая вкладка не заберут сундук дважды
    const { count } = await tx.raidReward.updateMany({ where: { id: reward.id, openedAt: null }, data: { openedAt: new Date() } });
    if (count === 0) return { ok: false as const, error: "Сундук рейда уже открыт" };

    await tx.xpEvent.create({
      data: { userId: user.id, amount: reward.xp, reason: XpReason.RAID_REWARD, meta: { raidId, code: reward.raid.bossCode, mvp: reward.mvp } },
    });
    const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: reward.xp } }, select: { xp: true } });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount: reward.xp };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

"use server";

import { revalidatePath } from "next/cache";
import { XpReason } from "@/generated/prisma/enums";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { GOBLIN_REWARD_XP } from "@/lib/goblin/rules";
import { levelProgress } from "@/lib/progress/level";
import { COIN_RATES } from "@/lib/shop/coins";
import { grantChestCoins } from "@/lib/shop/earn";

/** Сундук пойманного гоблина: 150 XP и монеты, забрать можно один раз. */
export async function openGoblinChestAction(id: string): Promise<{ ok: true; amount: number; coins: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const result = await db.$transaction(async (tx) => {
    const goblin = await tx.goblinEncounter.findFirst({ where: { id, userId: user.id } });
    if (!goblin?.caughtAt) return { ok: false as const, error: "Гоблин не пойман" };
    // Условие по rewardOpenedAt — второй клик или вторая вкладка не заберут сундук дважды
    const { count } = await tx.goblinEncounter.updateMany({ where: { id, rewardOpenedAt: null }, data: { rewardOpenedAt: new Date() } });
    if (count === 0) return { ok: false as const, error: "Сундук гоблина уже открыт" };

    const amount = GOBLIN_REWARD_XP;
    await tx.xpEvent.create({ data: { userId: user.id, amount, reason: XpReason.GOBLIN_REWARD, meta: { id } } });
    const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: amount } }, select: { xp: true } });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    const coins = await grantChestCoins(
      tx,
      user.id,
      { reason: "GOBLIN_CHEST", key: `chest:goblin:${id}`, amount: COIN_RATES.goblinChest, label: "Сундук гоблина" },
      xp - amount,
      xp,
    );
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount, coins };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

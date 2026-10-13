"use server";

import { revalidatePath } from "next/cache";
import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { chestReward } from "@/lib/progress/daily-chest";
import { grantChestCoins } from "@/lib/shop/earn";
import { COIN_RATES } from "@/lib/shop/coins";
import { levelProgress } from "@/lib/progress/level";
import { addWeeks, restoreOffer, weekKey, weeksBetween } from "@/lib/progress/weekly-streak";

/**
 * Выкуп сгоревшей серии за XP. Платим только XP, набранным внутри текущего уровня, —
 * уровень от покупки не падает. Пропущенные недели закрываются, серия «ждёт» текущую неделю.
 */
export async function restoreStreakAction(): Promise<{ ok: true; streak: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        xp: true,
        timeZone: true,
        currentStreak: true,
        lastStreakWeek: true,
        streakFreezes: true,
        streakRestoredAt: true,
        weekWorkouts: true,
        weekWorkoutsKey: true,
        freezeGrantedAt: true,
      },
    });
    const tz = safeTimeZone(u.timeZone);
    const offer = restoreOffer(u, now, tz);
    if (!offer || !u.lastStreakWeek) return { ok: false as const, error: "Эту серию уже нельзя восстановить" };
    const progress = levelProgress(u.xp).current;
    if (progress < offer.cost) {
      return { ok: false as const, error: `Не хватает ${offer.cost - progress} XP в текущем уровне` };
    }

    const current = weekKey(now, tz);
    // Условие по старым значениям — два параллельных нажатия не спишут XP дважды.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, lastStreakWeek: u.lastStreakWeek, streakRestoredAt: u.streakRestoredAt },
      data: { lastStreakWeek: addWeeks(current, -1), streakRestoredAt: now, xp: { decrement: offer.cost } },
    });
    if (count === 0) return { ok: false as const, error: "Серия уже восстановлена" };
    const missed = Array.from({ length: weeksBetween(u.lastStreakWeek, current) - 1 }, (_, i) => addWeeks(u.lastStreakWeek!, i + 1));
    await tx.streakCoverWeek.createMany({
      data: missed.map((week) => ({ userId: user.id, week, reason: "RESTORE" as const })),
      skipDuplicates: true,
    });
    await tx.xpEvent.create({
      data: { userId: user.id, amount: -offer.cost, reason: XpReason.STREAK_RESTORE, meta: { streak: offer.streak } },
    });
    return { ok: true as const, streak: offer.streak };
  });

  revalidatePath("/dashboard");
  return result;
}

export type OpenChestResult = { ok: true; amount: number; rare: boolean; streak: number; coins: number } | { ok: false; error: string };

/** Ежедневный сундук: раз в календарный день (пояс пользователя) — случайный XP, растущий с серией входов. */
export async function openDailyChestAction(): Promise<OpenChestResult> {
  const user = await requireUser();
  const today = dayKey(new Date(), safeTimeZone(user.timeZone));
  const day = new Date(`${today}T00:00:00Z`);

  const result = await db.$transaction(async (tx) => {
    // Условие по дню — два клика или две вкладки не откроют сундук дважды.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, OR: [{ chestOpenedDay: null }, { chestOpenedDay: { not: day } }] },
      data: { chestOpenedDay: day },
    });
    if (count === 0) return { ok: false as const, error: "Сегодняшний сундук уже открыт" };

    const { loginStreak } = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { loginStreak: true } });
    const reward = chestReward(loginStreak);
    await tx.xpEvent.create({
      data: {
        userId: user.id,
        amount: reward.amount,
        reason: XpReason.DAILY_LOGIN,
        meta: { day: today, streak: loginStreak, rare: reward.rare },
      },
    });
    const { xp } = await tx.user.update({
      where: { id: user.id },
      data: { xp: { increment: reward.amount } },
      select: { xp: true },
    });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    const coins = await grantChestCoins(
      tx,
      user.id,
      { reason: "DAILY_CHEST", key: `chest:daily:${today}`, amount: reward.rare ? COIN_RATES.dailyChestRare : COIN_RATES.dailyChest, label: "Ежедневный сундук" },
      xp - reward.amount,
      xp,
    );
    // Новый уровень может принести ачивку
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount: reward.amount, rare: reward.rare, streak: loginStreak, coins };
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}

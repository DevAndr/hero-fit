"use server";

import { revalidatePath } from "next/cache";
import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { levelProgress } from "@/lib/progress/level";
import { restoredLastStreakAt, restoreOffer } from "@/lib/progress/streak";

/**
 * Выкуп сгоревшей серии за XP. Платим только XP, набранным внутри текущего уровня, —
 * уровень от покупки не падает. После выкупа — сутки, чтобы продлить серию тренировкой.
 */
export async function restoreStreakAction(): Promise<{ ok: true; streak: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const u = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { xp: true, currentStreak: true, lastStreakAt: true, streakFreezes: true, streakRestoredAt: true },
    });
    const offer = restoreOffer(u, now);
    if (!offer) return { ok: false as const, error: "Эту серию уже нельзя восстановить" };
    const progress = levelProgress(u.xp).current;
    if (progress < offer.cost) {
      return { ok: false as const, error: `Не хватает ${offer.cost - progress} XP в текущем уровне` };
    }

    // Условие по старому lastStreakAt — два параллельных нажатия не спишут XP дважды.
    const { count } = await tx.user.updateMany({
      where: { id: user.id, lastStreakAt: u.lastStreakAt },
      data: { lastStreakAt: restoredLastStreakAt(now), streakRestoredAt: now, xp: { decrement: offer.cost } },
    });
    if (count === 0) return { ok: false as const, error: "Серия уже восстановлена" };
    await tx.xpEvent.create({
      data: { userId: user.id, amount: -offer.cost, reason: XpReason.STREAK_RESTORE, meta: { streak: offer.streak } },
    });
    return { ok: true as const, streak: offer.streak };
  });

  revalidatePath("/dashboard");
  return result;
}

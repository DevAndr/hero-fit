"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { GoalStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { queueGoal } from "@/lib/analytics/queue";
import { dayKey } from "@/lib/daily-login";
import { markAchieved } from "@/lib/goals/mutations";
import { goalOpenAt, goalTitle, isAchieved } from "@/lib/goals/rules";

/** Замер: 0…200 см с шагом 0,5. */
const cmSchema = z
  .number({ error: "Замер — от 0 до 200 см, шаг 0,5" })
  .min(0, "Замер — от 0 до 200 см")
  .max(200, "Замер — от 0 до 200 см")
  .refine((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9, "Шаг — 0,5 см");

/**
 * Замер гибкости по своей активной цели «Навык»: один в местный день (повтор за день заменяет).
 * Замер 0 — цель достигнута (уведомление и сундук). Флаг `stretching` не нужен: поставленная цель живёт без него.
 */
export async function logStretchMeasurementAction(goalId: string, cm: number): Promise<{ ok: true; achieved: boolean } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = cmSchema.safeParse(cm);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (typeof goalId !== "string" || !goalId) return { ok: false, error: "Цель не найдена" };
  const now = new Date();
  const date = dayKey(now, user.timeZone);
  const achieved = await db.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({ where: { id: goalId, userId: user.id, type: "STRETCH_SKILL", status: GoalStatus.ACTIVE } });
    if (!goal) return null;
    await tx.stretchMeasurement.upsert({
      where: { goalId_date: { goalId, date } },
      create: { userId: user.id, goalId, date, cm: parsed.data },
      update: { cm: parsed.data },
    });
    // Срок вышел — замер пишется, но цель уже не закрывается (как у взвешивания)
    if (!isAchieved(goal, parsed.data) || !goalOpenAt(goal, now, user.timeZone)) return false;
    return markAchieved(tx, user.id, { id: goal.id, title: goalTitle(goal) }, now, true);
  });
  if (achieved === null) return { ok: false, error: "Цель не найдена" };
  if (achieved) {
    await evaluateAchievementsNow(user.id);
    await queueGoal("goal_achieved");
  }
  revalidatePath("/goals");
  revalidatePath("/stretching");
  revalidatePath("/dashboard");
  return { ok: true, achieved };
}

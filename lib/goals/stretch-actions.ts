"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { queueGoal } from "@/lib/analytics/queue";
import { cmSchema } from "@/lib/goals/cm-schema";
import { writeMeasurement } from "@/lib/goals/stretch-measure";

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
  const achieved = await db.$transaction(async (tx) => {
    return writeMeasurement(tx, user, goalId, parsed.data, now);
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

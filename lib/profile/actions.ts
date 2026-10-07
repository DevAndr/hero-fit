"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";

const bodyWeightSchema = z.number().min(30).max(300).nullable();

/** Вес тела (кг) — для ачивок «1RM к весу тела»; null — стереть. */
export async function updateBodyWeightAction(value: number | null): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = bodyWeightSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: "Укажите вес от 30 до 300 кг" };
  await db.user.update({ where: { id: user.id }, data: { bodyWeight: parsed.data } });
  await evaluateAchievementsNow(user.id);
  revalidatePath("/settings");
  return { ok: true };
}

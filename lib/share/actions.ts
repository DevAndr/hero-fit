"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** Тумблер «Показывать карточку после рекорда» (/settings). */
export async function updateRecordCardsAction(on: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = z.boolean().safeParse(on);
  if (!parsed.success) return { ok: false };
  await db.user.update({ where: { id: user.id }, data: { shareRecordCards: parsed.data } });
  revalidatePath("/settings");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/coach/access";
import { db } from "@/lib/db";

/** Скрыть «Первые шаги» (hidden) или вернуть их на /coach. */
export async function setCoachGuideHiddenAction(hidden: boolean) {
  const coach = await requireCoach();
  await db.user.update({ where: { id: coach.id }, data: { coachGuideHiddenAt: hidden ? new Date() : null } });
  revalidatePath("/coach");
}

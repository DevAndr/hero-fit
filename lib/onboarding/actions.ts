"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queueGoal } from "@/lib/analytics/queue";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { markOnboarded } from "@/lib/onboarding/complete";

/** Экскурсия закончена: done — дошёл до финала («Не сейчас», «Соберу сам»), skip — «Пропустить». */
export async function completeOnboardingAction(reason: "done" | "skip"): Promise<void> {
  const user = await requireUser();
  if (await markOnboarded(user.id)) await queueGoal(reason === "done" ? "onboarding_done" : "onboarding_skip");
  revalidatePath("/dashboard");
}

/** «Показать экскурсию ещё раз» из настроек. */
export async function restartOnboardingAction(): Promise<never> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { onboardedAt: null } });
  redirect("/dashboard");
}

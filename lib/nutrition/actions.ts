"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { logBodyWeightAction } from "@/lib/goals/actions";
import { nutritionProfileSchema, type NutritionProfileInput } from "@/lib/nutrition/schema";

/** values — введённое, чтобы форма не сбросила поля после ошибки (React сбрасывает форму после action). */
export type NutritionFormState = { ok?: boolean; errors?: Partial<Record<keyof NutritionProfileInput, string[]>>; values?: Record<string, string> };

async function nutritionUser() {
  const user = await requireUser();
  if (!(await isEnabled("nutrition", user.id))) notFound();
  return user;
}

/** Анкета нормы: поля User и пол; вес — обычным взвешиванием за сегодня (журнал, цель по весу, ачивки). */
export async function saveNutritionProfileAction(_prev: NutritionFormState, formData: FormData): Promise<NutritionFormState> {
  const user = await nutritionUser();
  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !e[0].startsWith("$")));
  const parsed = nutritionProfileSchema.safeParse(raw);
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors, values };
  const { gender, birthYear, heightCm, weight, activity, goal } = parsed.data;
  await db.user.update({ where: { id: user.id }, data: { gender, birthYear, heightCm, activityLevel: activity, nutritionGoal: goal } });
  const logged = await logBodyWeightAction(weight);
  if (!logged.ok) return { errors: { weight: [logged.error] }, values };
  revalidatePath("/nutrition");
  return { ok: true };
}

/**
 * Режим ввода: продвинутый (Б/Ж/У) или только ккал — переключатель «Белки, жиры, углеводы» и диалог первого захода
 * (закрыли без выбора — упрощённый). Ставит отметку выбора: диалог больше не показывается.
 */
export async function setNutritionMacrosAction(on: boolean) {
  const user = await nutritionUser();
  await db.user.update({ where: { id: user.id }, data: { nutritionMacros: on === true, nutritionModeChosenAt: new Date() } });
  revalidatePath("/nutrition");
}

/** «Очистить данные питания»: пол и вес остаются — они общие с настройками и целями. */
export async function clearNutritionProfileAction() {
  const user = await nutritionUser();
  await db.user.update({ where: { id: user.id }, data: { heightCm: null, birthYear: null, activityLevel: null, nutritionGoal: null } });
  revalidatePath("/nutrition");
}

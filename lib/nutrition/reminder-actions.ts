"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/dal";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { alreadyPassedToday, canAddReminder, mealReminderSchema } from "@/lib/nutrition/reminders";

// Напоминания о приёмах пищи (спека 2026-11-13-meal-reminders-design). Действия не бросают на мусорном вводе:
// всё, что с клиента, проверяется zod; чужие записи недоступны (where: { id, userId }).

export type MealReminderResult = { ok: true } | { ok: false; error: string };

const LIMIT = "Не больше 6 напоминаний";
const TAKEN = "На это время уже есть напоминание";
const NOT_FOUND = "Напоминание не найдено — обновите страницу";
const BAD_ADD = "Проверьте время и приём пищи";

const fail = (error: string): MealReminderResult => ({ ok: false, error });
const isTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const patchSchema = mealReminderSchema.partial().extend({ enabled: z.boolean().optional() });

async function reminderUser() {
  const user = await requireUser();
  if (!(await isEnabled("nutrition", user.id))) notFound();
  const timeZone = safeTimeZone(user.timeZone);
  return { id: user.id, timeZone, today: dayKey(new Date(), timeZone) };
}

/** Время, которое сегодня уже прошло, не должно сработать «задним числом» — отмечаем сегодняшний день решённым. */
const passedMark = (u: { timeZone: string; today: string }, minutes: number) => (alreadyPassedToday(new Date(), u.timeZone, minutes) ? u.today : null);

export async function addMealReminderAction(input: { meal: string; minutes: number }): Promise<MealReminderResult> {
  const user = await reminderUser();
  const parsed = mealReminderSchema.safeParse(input);
  if (!parsed.success) return fail(BAD_ADD);
  const { meal, minutes } = parsed.data;
  try {
    const problem = await db.$transaction(async (tx) => {
      // Блокировка строки пользователя — параллельные добавления идут по очереди, лимит не обойти
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const existing = await tx.mealReminder.findMany({ where: { userId: user.id }, select: { minutes: true } });
      const found = canAddReminder(existing, minutes);
      if (found) return found;
      await tx.mealReminder.create({ data: { userId: user.id, meal, minutes, remindedDay: passedMark(user, minutes) } });
      return null;
    });
    if (problem) return fail(problem === "limit" ? LIMIT : TAKEN);
  } catch (e) {
    if (isTaken(e)) return fail(TAKEN);
    throw e;
  }
  revalidatePath("/nutrition");
  return { ok: true };
}

export async function updateMealReminderAction(id: string, patch: { meal?: string; minutes?: number; enabled?: boolean }): Promise<MealReminderResult> {
  const user = await reminderUser();
  if (typeof id !== "string") return fail(NOT_FOUND);
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return fail(NOT_FOUND);
  const { meal, minutes, enabled } = parsed.data;
  if (meal === undefined && minutes === undefined && enabled === undefined) return { ok: true };

  const data: Prisma.MealReminderUpdateManyMutationInput = {};
  if (meal !== undefined) data.meal = meal;
  if (enabled !== undefined) data.enabled = enabled;
  if (minutes !== undefined) {
    data.minutes = minutes;
    // Только при реальной смене времени: прошедшее сегодня не должно сработать задним числом, а перенос на ещё
    // не наступившее снимает отметку дня — иначе строка, созданная с прошедшим временем по умолчанию, сегодня молчит
    const current = await db.mealReminder.findFirst({ where: { id, userId: user.id }, select: { minutes: true } });
    if (current && current.minutes !== minutes) data.remindedDay = passedMark(user, minutes);
  }
  try {
    const { count } = await db.mealReminder.updateMany({ where: { id, userId: user.id }, data });
    if (count === 0) return fail(NOT_FOUND);
  } catch (e) {
    if (isTaken(e)) return fail(TAKEN);
    throw e;
  }
  revalidatePath("/nutrition");
  return { ok: true };
}

export async function deleteMealReminderAction(id: string): Promise<MealReminderResult> {
  const user = await reminderUser();
  if (typeof id !== "string") return fail(NOT_FOUND);
  const { count } = await db.mealReminder.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) return fail(NOT_FOUND);
  revalidatePath("/nutrition");
  return { ok: true };
}

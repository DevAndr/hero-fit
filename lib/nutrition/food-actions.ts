"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { Meal } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { MEALS, parseDiaryDate } from "@/lib/nutrition/diary";
import { foodEntrySchema, type FoodEntryInput } from "@/lib/nutrition/food-schema";

/** values — введённое, чтобы форма не сбросила поля после ошибки (React сбрасывает форму после action). */
export type FoodFormState = { ok?: boolean; errors?: Partial<Record<keyof FoodEntryInput, string[]>>; values?: Record<string, string> };

const deletedSelect = { date: true, meal: true, name: true, kcal: true, protein: true, fat: true, carbs: true, createdAt: true } as const;
export type DeletedFood = { date: string; meal: Meal; name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null; createdAt: string };

async function diaryUser() {
  const user = await requireUser();
  if (!(await isEnabled("nutrition", user.id))) notFound();
  return { id: user.id, today: dayKey(new Date(), safeTimeZone(user.timeZone)) };
}

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData);
  const values = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !e[0].startsWith("$")));
  const parsed = foodEntrySchema.safeParse(raw);
  return parsed.success ? { data: parsed.data } : { state: { errors: z.flattenError(parsed.error).fieldErrors, values } satisfies FoodFormState };
}

const done = (): FoodFormState => {
  revalidatePath("/nutrition");
  return { ok: true };
};

/** Новая запись в день `date` (будущее и мусор → сегодня, старше года → граница года). */
export async function addFoodEntryAction(date: string, _prev: FoodFormState, formData: FormData): Promise<FoodFormState> {
  const user = await diaryUser();
  const form = parseForm(formData);
  if (!form.data) return form.state;
  await db.foodEntry.create({ data: { userId: user.id, date: parseDiaryDate(date, user.today), ...form.data } });
  return done();
}

export async function updateFoodEntryAction(id: string, _prev: FoodFormState, formData: FormData): Promise<FoodFormState> {
  const user = await diaryUser();
  if (typeof id !== "string") return { errors: { name: ["Запись не найдена — обновите страницу"] } };
  const form = parseForm(formData);
  if (!form.data) return form.state;
  const { count } = await db.foodEntry.updateMany({ where: { id, userId: user.id }, data: form.data });
  if (count === 0) return { errors: { name: ["Запись не найдена — обновите страницу"] } };
  return done();
}

/** Удаление; возвращает удалённое — для «Отменить» в уведомлении (restoreFoodEntryAction). */
export async function deleteFoodEntryAction(id: string): Promise<DeletedFood | null> {
  const user = await diaryUser();
  if (typeof id !== "string") return null;
  const entry = await db.foodEntry.findFirst({ where: { id, userId: user.id }, select: deletedSelect });
  if (!entry) return null;
  await db.foodEntry.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/nutrition");
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

/** «Отменить» удаление: та же запись в тот же день и приём; данные с клиента проверяются как новая запись. */
export async function restoreFoodEntryAction(entry: DeletedFood) {
  const user = await diaryUser();
  const parsed = foodEntrySchema.safeParse(entry);
  if (!parsed.success || typeof entry.date !== "string") return;
  const createdAt = new Date(entry.createdAt);
  await db.foodEntry.create({
    data: {
      userId: user.id,
      date: parseDiaryDate(entry.date, user.today),
      ...parsed.data,
      // Прежнее место в приёме; мусор — сейчас
      createdAt: Number.isNaN(createdAt.getTime()) || createdAt.getTime() > Date.now() ? new Date() : createdAt,
    },
  });
  revalidatePath("/nutrition");
}

/** «Добавить сегодня»: копия в тот же приём на местное сегодня. */
export async function copyFoodEntryToTodayAction(id: string) {
  const user = await diaryUser();
  if (typeof id !== "string") return;
  const entry = await db.foodEntry.findFirst({ where: { id, userId: user.id }, select: { meal: true, name: true, kcal: true, protein: true, fat: true, carbs: true } });
  if (entry) await db.foodEntry.create({ data: { userId: user.id, date: user.today, ...entry } });
  revalidatePath("/nutrition");
}

/** «Повторить вчерашний»: записи приёма с date − 1 на date — только если приём date ещё пуст (двойной клик не задвоит). */
export async function repeatYesterdayMealAction(date: string, meal: Meal) {
  const user = await diaryUser();
  if (!MEALS.includes(meal)) return;
  const day = parseDiaryDate(date, user.today);
  await db.$transaction(async (tx) => {
    // Блокировка строки пользователя — параллельный повтор ждёт и видит уже скопированное
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    if (await tx.foodEntry.count({ where: { userId: user.id, date: day, meal } })) return;
    const source = await tx.foodEntry.findMany({
      where: { userId: user.id, date: addDays(day, -1), meal },
      orderBy: { createdAt: "asc" },
      select: { name: true, kcal: true, protein: true, fat: true, carbs: true },
    });
    const base = Date.now();
    await tx.foodEntry.createMany({ data: source.map((e, i) => ({ userId: user.id, date: day, meal, ...e, createdAt: new Date(base + i) })) });
  });
  revalidatePath("/nutrition");
}

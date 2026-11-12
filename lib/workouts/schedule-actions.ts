"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { WorkoutStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { entryKey } from "@/lib/plans/expand";
import { planDateSchema, planTimeSchema } from "@/lib/plans/schema";
import { scheduleTimeZone, slotError } from "@/lib/workouts/schedule";

type ScheduleResult = { ok: true } | { ok: false; error: string };
type ScheduleUser = Awaited<ReturnType<typeof requireUser>>;
type SlotInput = { date: string; time: string; emailReminder: boolean };

const scheduleInputSchema = z.object({
  workoutId: z.string().min(1),
  date: planDateSchema,
  time: planTimeSchema,
  emailReminder: z.boolean(),
});

class AlreadyScheduled extends Error {}

function revalidate() {
  revalidatePath("/training");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

/** Пояс выбора (cookie браузера точнее User.timeZone) и проверка слота в нём. */
async function checkSlot(user: ScheduleUser, slot: { date: string; time: string }) {
  const cookie = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const timeZone = scheduleTimeZone(cookie, user.timeZone);
  return { cookie, timeZone, error: slotError(slot, new Date(), timeZone) };
}

/**
 * Запись календаря и пометка тренировки в одной транзакции. claim — условный updateMany тренировки:
 * 0 строк — параллельный вызов уже ответил, запись откатывается. false — «уже запланировано».
 */
async function createClaimedEntry(
  user: ScheduleUser,
  zone: { cookie: string | undefined; timeZone: string },
  entry: SlotInput & { templateId: string | null; title: string },
  claim: (tx: Prisma.TransactionClient, entryId: string) => Promise<number>,
): Promise<boolean> {
  try {
    await db.$transaction(async (tx) => {
      const created = await tx.planEntry.create({
        data: {
          userId: user.id,
          templateId: entry.templateId,
          title: entry.title,
          date: entry.date,
          time: entry.time,
          durationMin: 60,
          emailReminder: entry.emailReminder && !!user.email,
        },
      });
      if ((await claim(tx, created.id)) === 0) throw new AlreadyScheduled();
      // Тик напоминаний считает по User.timeZone: у новичка там может быть ещё UTC, а слот выбран по времени браузера
      if (zone.timeZone === zone.cookie && zone.timeZone !== user.timeZone) {
        await tx.user.update({ where: { id: user.id }, data: { timeZone: zone.timeZone } });
      }
    });
  } catch (e) {
    if (e instanceof AlreadyScheduled) return false;
    throw e;
  }
  revalidate();
  return true;
}

/** Больше не спрашивать про эту тренировку (условно: уже ответили — ничего не меняется). */
async function markAsked(userId: string, workoutId: string, status?: WorkoutStatus) {
  await db.workout.updateMany({
    where: { id: workoutId, userId, scheduleAskedAt: null, ...(status ? { status } : {}) },
    data: { scheduleAskedAt: new Date() },
  });
  revalidate();
}

/** Диалог «Когда тренировка?»: привязывает черновик первой тренировки к новой записи календаря. */
export async function scheduleDraftAction(input: {
  workoutId: string;
  date: string;
  time: string;
  emailReminder: boolean;
}): Promise<ScheduleResult> {
  const user = await requireUser();
  const parsed = scheduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте дату и время" };
  if (!(await isEnabled("first_workout_reminder", user.id))) return { ok: false, error: "Недоступно" };

  const { workoutId, ...slot } = parsed.data;
  const zone = await checkSlot(user, slot);
  if (zone.error) return { ok: false, error: zone.error };

  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id, status: "PLANNED" },
    select: { id: true, name: true, templateId: true },
  });
  if (!workout) return { ok: false, error: "Тренировка не найдена" };

  const created = await createClaimedEntry(user, zone, { ...slot, templateId: workout.templateId, title: workout.name }, async (tx, entryId) => {
    const { count } = await tx.workout.updateMany({
      where: { id: workout.id, userId: user.id, status: "PLANNED", planKey: null },
      data: { planKey: entryKey(entryId), scheduleAskedAt: new Date() },
    });
    return count;
  });
  return created ? { ok: true } : { ok: false, error: "Тренировка уже запланирована" };
}

/** «Не сейчас»: больше не спрашивать про этот черновик. */
export async function dismissScheduleAction(workoutId: string): Promise<void> {
  const user = await requireUser();
  await markAsked(user.id, workoutId);
}

/** Карточка «Когда следующая тренировка?» в сводке: новая запись календаря «Тренировка», тренировка помечается спрошенной. */
export async function scheduleNextAction(input: {
  workoutId: string;
  date: string;
  time: string;
  emailReminder: boolean;
}): Promise<ScheduleResult> {
  const user = await requireUser();
  const parsed = scheduleInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте дату и время" };
  if (!(await isEnabled("next_workout_ask", user.id))) return { ok: false, error: "Недоступно" };

  const { workoutId, ...slot } = parsed.data;
  const zone = await checkSlot(user, slot);
  if (zone.error) return { ok: false, error: zone.error };

  const created = await createClaimedEntry(user, zone, { ...slot, templateId: null, title: "Тренировка" }, async (tx) => {
    const { count } = await tx.workout.updateMany({
      where: { id: workoutId, userId: user.id, status: WorkoutStatus.COMPLETED, scheduleAskedAt: null },
      data: { scheduleAskedAt: new Date() },
    });
    return count;
  });
  return created ? { ok: true } : { ok: false, error: "Уже запланировано" };
}

/** «Не сейчас» в карточке сводки: больше не спрашивать про эту тренировку, записи нет. */
export async function dismissNextAction(workoutId: string): Promise<void> {
  const user = await requireUser();
  await markAsked(user.id, workoutId, WorkoutStatus.COMPLETED);
}

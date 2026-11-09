"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { TIMEZONE_COOKIE } from "@/lib/achievements/daily-visit";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { entryKey } from "@/lib/plans/expand";
import { planDateSchema, planTimeSchema } from "@/lib/plans/schema";
import { scheduleTimeZone, slotError } from "@/lib/workouts/schedule";

type ScheduleResult = { ok: true } | { ok: false; error: string };

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

  const { workoutId, date, time, emailReminder } = parsed.data;
  const cookie = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  const timeZone = scheduleTimeZone(cookie, user.timeZone);
  const error = slotError({ date, time }, new Date(), timeZone);
  if (error) return { ok: false, error };

  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id, status: "PLANNED" },
    select: { id: true, name: true, templateId: true },
  });
  if (!workout) return { ok: false, error: "Тренировка не найдена" };

  try {
    await db.$transaction(async (tx) => {
      const entry = await tx.planEntry.create({
        data: {
          userId: user.id,
          templateId: workout.templateId,
          title: workout.name,
          date,
          time,
          durationMin: 60,
          emailReminder: emailReminder && !!user.email,
        },
      });
      const { count } = await tx.workout.updateMany({
        where: { id: workout.id, userId: user.id, status: "PLANNED", planKey: null },
        data: { planKey: entryKey(entry.id), scheduleAskedAt: new Date() },
      });
      // Параллельный вызов уже привязал черновик — откатываем созданную запись.
      if (count === 0) throw new AlreadyScheduled();
      // Тик напоминаний считает по User.timeZone: у новичка там может быть ещё UTC, а слот выбран по времени браузера
      if (timeZone === cookie && timeZone !== user.timeZone) {
        await tx.user.update({ where: { id: user.id }, data: { timeZone } });
      }
    });
  } catch (e) {
    if (e instanceof AlreadyScheduled) return { ok: false, error: "Тренировка уже запланирована" };
    throw e;
  }

  revalidate();
  return { ok: true };
}

/** «Не сейчас»: больше не спрашивать про этот черновик. */
export async function dismissScheduleAction(workoutId: string): Promise<void> {
  const user = await requireUser();
  await db.workout.updateMany({
    where: { id: workoutId, userId: user.id, scheduleAskedAt: null },
    data: { scheduleAskedAt: new Date() },
  });
  revalidate();
}

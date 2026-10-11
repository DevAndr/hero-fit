"use server";

import { revalidatePath } from "next/cache";
import { NotificationType, WorkoutStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { clientDisplayName } from "@/lib/coach/clients";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { feedbackNotice, feedbackSchema, shouldNotifyCoach } from "@/lib/workouts/feedback";

type Result = { ok: true; rpe: number; note: string | null } | { ok: false; error: string };

/**
 * Оценка своей завершённой тренировки: тяжесть и заметка. Активному тренеру — уведомление, если есть заметка или
 * тяжесть 9+, один раз на тренировку (правка не уведомляет повторно — тренер видит актуальное в сводке).
 */
export async function saveWorkoutFeedbackAction(workoutId: string, input: { rpe: number; note: string }): Promise<Result> {
  const user = await requireUser();
  const parsed = feedbackSchema.safeParse({ rpe: Number(input?.rpe), note: String(input?.note ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте оценку" };
  const { rpe, note } = parsed.data;
  const id = String(workoutId);

  const result = await db.$transaction(async (tx) => {
    const { count } = await tx.workout.updateMany({
      where: { id, userId: user.id, status: WorkoutStatus.COMPLETED },
      data: { rpe, notes: note },
    });
    if (!count) return false;
    // Запросы в транзакции — по очереди: у неё одно соединение (параллельные через pg-адаптер вешают его)
    const workout = await tx.workout.findUniqueOrThrow({ where: { id }, select: { feedbackNotifiedAt: true } });
    const link = await tx.coachLink.findFirst({
      where: { clientId: user.id, endedAt: null },
      select: { coachId: true, client: { select: { nickname: true, name: true } } },
    });
    if (!link || !shouldNotifyCoach({ rpe, note, notifiedAt: workout.feedbackNotifiedAt })) return true;
    // Двойное «Сохранить» или две вкладки: уведомляет только тот, кто первым поставил отметку
    const claimed = await tx.workout.updateMany({ where: { id, feedbackNotifiedAt: null }, data: { feedbackNotifiedAt: new Date() } });
    if (claimed.count) {
      await notify(
        tx,
        link.coachId,
        {
          type: NotificationType.COACH,
          title: feedbackNotice(clientDisplayName(link.client), rpe, note),
          body: "Оценка тренировки",
          url: `/coach/clients/${user.id}/workouts/${id}`,
        },
        { push: true },
      );
    }
    return true;
  });
  if (!result) return { ok: false, error: "Тренировка не найдена" };

  revalidatePath(`/workouts/${id}`);
  return { ok: true, rpe, note };
}

"use server";

import { revalidatePath } from "next/cache";
import { NotificationType, WorkoutStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { clientDisplayName } from "@/lib/coach/clients";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { coachNotice, FEEDBACK_NOTICE_BODY, feedbackNotice, feedbackSchema } from "@/lib/workouts/feedback";

type Result = { ok: true; rpe: number; note: string | null } | { ok: false; error: string };

/**
 * Оценка своей завершённой тренировки: тяжесть и заметка. Активному тренеру — уведомление, если есть заметка или
 * тяжесть 9+; потом — только новая или изменённая заметка: непрочитанное уведомление об оценке обновляется (без push),
 * прочитанное — новое с push (как 👊).
 */
export async function saveWorkoutFeedbackAction(workoutId: string, input: { rpe: number; note: string }): Promise<Result> {
  const user = await requireUser();
  const parsed = feedbackSchema.safeParse({ rpe: Number(input?.rpe), note: String(input?.note ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте оценку" };
  const { rpe, note } = parsed.data;
  const id = String(workoutId);

  const result = await db.$transaction(async (tx) => {
    // Запросы в транзакции — по очереди: у неё одно соединение (параллельные через pg-адаптер вешают его)
    const before = await tx.workout.findFirst({
      where: { id, userId: user.id, status: WorkoutStatus.COMPLETED },
      select: { notes: true, feedbackNotifiedAt: true },
    });
    if (!before) return false;
    await tx.workout.update({ where: { id }, data: { rpe, notes: note } });
    const kind = coachNotice({ rpe, note, prevNote: before.notes, notifiedAt: before.feedbackNotifiedAt });
    if (!kind) return true;
    const link = await tx.coachLink.findFirst({
      where: { clientId: user.id, endedAt: null },
      select: { coachId: true, client: { select: { nickname: true, name: true } } },
    });
    if (!link) return true;
    const message = {
      type: NotificationType.COACH,
      title: feedbackNotice(clientDisplayName(link.client), rpe, note),
      body: FEEDBACK_NOTICE_BODY,
      url: `/coach/clients/${user.id}/workouts/${id}`,
    };
    if (kind === "first") {
      // Двойное «Сохранить» или две вкладки: уведомляет только тот, кто первым поставил отметку
      const claimed = await tx.workout.updateMany({ where: { id, feedbackNotifiedAt: null }, data: { feedbackNotifiedAt: new Date() } });
      if (claimed.count) await notify(tx, link.coachId, message, { push: true });
      return true;
    }
    const unread = await tx.notification.findFirst({
      where: { userId: link.coachId, type: message.type, url: message.url, body: message.body, readAt: null },
      select: { id: true },
    });
    if (unread) await tx.notification.update({ where: { id: unread.id }, data: { title: message.title, createdAt: new Date() } });
    else await notify(tx, link.coachId, message, { push: true });
    return true;
  });
  if (!result) return { ok: false, error: "Тренировка не найдена" };

  revalidatePath(`/workouts/${id}`);
  return { ok: true, rpe, note };
}

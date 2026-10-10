"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType, WorkoutStatus } from "@/generated/prisma/enums";
import { queueGoal } from "@/lib/analytics/queue";
import { requireClientOf } from "@/lib/coach/access";
import { commentPreview, commentTextSchema } from "@/lib/coach/comments";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";

type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Тренировка не найдена";

function revalidate(clientId: string, workoutId: string) {
  revalidatePath(`/coach/clients/${clientId}/workouts/${workoutId}`);
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath(`/workouts/${workoutId}`);
}

/**
 * Уведомление клиенту: пока предыдущее о комментариях к этой тренировке не прочитано — обновляем его
 * (как 👊), push — только на первое.
 */
async function notifyClient(clientId: string, workout: { id: string; name: string }, text: string) {
  const url = `/workouts/${workout.id}`;
  const title = `Комментарий тренера к «${workout.name}»`;
  const body = commentPreview(text);
  const unread = await db.notification.findFirst({
    where: { userId: clientId, type: NotificationType.COACH, url, readAt: null },
    select: { id: true },
  });
  if (unread) await db.notification.update({ where: { id: unread.id }, data: { title, body, createdAt: new Date() } });
  else await notify(db, clientId, { type: NotificationType.COACH, title, body, url }, { push: true });
}

/** Общий комментарий (workoutExerciseId = null) или заметка к упражнению завершённой тренировки клиента. */
export async function saveCoachCommentAction(clientId: string, workoutId: string, workoutExerciseId: string | null, text: string): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsed = commentTextSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте текст" };
  const workout = await db.workout.findFirst({
    where: { id: String(workoutId), userId: clientId, status: WorkoutStatus.COMPLETED },
    select: { id: true, name: true },
  });
  if (!workout) return { ok: false, error: NOT_FOUND };
  const exerciseId = workoutExerciseId === null ? null : String(workoutExerciseId);
  if (exerciseId && !(await db.workoutExercise.count({ where: { id: exerciseId, workoutId: workout.id } }))) return { ok: false, error: NOT_FOUND };

  const slot = { workoutId: workout.id, workoutExerciseId: exerciseId };
  const existing = await db.coachComment.findFirst({ where: slot, select: { id: true, coachId: true } });
  if (existing && existing.coachId !== coach.id) return { ok: false, error: "Здесь уже есть комментарий другого тренера" };
  if (existing) {
    await db.coachComment.update({ where: { id: existing.id }, data: { text: parsed.data } });
  } else {
    try {
      await db.coachComment.create({ data: { ...slot, coachId: coach.id, clientId, text: parsed.data } });
    } catch (e) {
      // Двойной «Сохранить»: место уже занято параллельным запросом — обновляем его
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      const { count } = await db.coachComment.updateMany({ where: { ...slot, coachId: coach.id }, data: { text: parsed.data } });
      revalidate(clientId, workout.id);
      if (!count) return { ok: false, error: "Здесь уже есть комментарий другого тренера" };
      return { ok: true };
    }
    await notifyClient(clientId, workout, parsed.data);
    await queueGoal("coach_comment");
  }
  revalidate(clientId, workout.id);
  return { ok: true };
}

export async function deleteCoachCommentAction(clientId: string, commentId: string): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const comment = await db.coachComment.findFirst({ where: { id: String(commentId), clientId, coachId: coach.id }, select: { workoutId: true } });
  if (!comment) return { ok: false, error: "Комментарий не найден" };
  await db.coachComment.delete({ where: { id: String(commentId) } });
  revalidate(clientId, comment.workoutId);
  return { ok: true };
}

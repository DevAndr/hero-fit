import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { db } from "@/lib/db";

export type CommentView = { id: string; workoutExerciseId: string | null; text: string; coachName: string; updatedAt: Date };

/** Комментарии к тренировке: все (клиенту) или только этого тренера (coachId). */
export async function getWorkoutComments(workoutId: string, coachId?: string): Promise<CommentView[]> {
  const rows = await db.coachComment.findMany({
    where: { workoutId, ...(coachId ? { coachId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, workoutExerciseId: true, text: true, updatedAt: true, coach: { select: { nickname: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    workoutExerciseId: r.workoutExerciseId,
    text: r.text,
    updatedAt: r.updatedAt,
    coachName: r.coach ? clientDisplayName(r.coach) : "Тренер",
  }));
}

/**
 * Клиент открыл сводку — комментарии к этой тренировке прочитаны, и уведомление о них тоже:
 * иначе следующий комментарий молча обновит старое уведомление без push (группировка — по непрочитанному).
 */
export async function markCommentsRead(clientId: string, workoutId: string) {
  const now = new Date();
  await db.coachComment.updateMany({ where: { clientId, workoutId, readAt: null }, data: { readAt: now } });
  await db.notification.updateMany({
    where: { userId: clientId, type: NotificationType.COACH, url: `/workouts/${workoutId}`, readAt: null },
    data: { readAt: now },
  });
}

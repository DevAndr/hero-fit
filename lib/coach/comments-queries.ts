import "server-only";
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

/** Клиент открыл сводку — его непрочитанные комментарии к этой тренировке прочитаны. */
export async function markCommentsRead(clientId: string, workoutId: string) {
  await db.coachComment.updateMany({ where: { clientId, workoutId, readAt: null }, data: { readAt: new Date() } });
}

import { db } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";
import { stretchOnlyWhere } from "@/lib/templates/queries";

export type StretchTemplate = { id: string; name: string; description: string | null; own: boolean; exercises: number };

/** Шаблоны только из растяжки: готовые программы и свои. */
export async function listStretchTemplates(userId: string): Promise<StretchTemplate[]> {
  const rows = await db.workoutTemplate.findMany({
    where: { OR: [{ userId }, { userId: null }], ...stretchOnlyWhere },
    orderBy: [{ userId: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    select: { id: true, userId: true, name: true, description: true, _count: { select: { exercises: true } } },
  });
  return rows.map((t) => ({ id: t.id, name: t.name, description: t.description, own: t.userId !== null, exercises: t._count.exercises }));
}

/** Рекорд удержания (секунды) по упражнениям растяжки — только у сделанных. */
export async function getHoldRecords(userId: string): Promise<Record<string, number>> {
  const rows = await db.personalRecord.findMany({
    where: { userId, type: "MAX_DURATION", exercise: { kind: "STRETCH" } },
    select: { exerciseId: true, value: true },
  });
  return Object.fromEntries(rows.map((r) => [r.exerciseId, r.value]));
}

export async function hasActiveWorkout(userId: string): Promise<boolean> {
  return (await db.workout.count({ where: { userId, status: { in: ACTIVE_STATUSES } } })) > 0;
}

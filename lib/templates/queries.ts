import "server-only";
import { db } from "@/lib/db";
import { ownTargets } from "@/lib/templates/progression";

const listSelect = {
  id: true,
  userId: true,
  name: true,
  description: true,
  program: true,
  exercises: {
    orderBy: { order: "asc" as const },
    select: { targetSets: true, exercise: { select: { name: true, archivedAt: true } } },
  },
};

export async function listTemplates(userId: string) {
  const [mine, programs] = await Promise.all([
    db.workoutTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: listSelect }),
    db.workoutTemplate.findMany({
      where: { userId: null },
      orderBy: [{ program: "asc" }, { name: "asc" }],
      select: listSelect,
    }),
  ]);
  return { mine, programs };
}

export type TemplateListItem = Awaited<ReturnType<typeof listTemplates>>["mine"][number];

/** Шаблон для редактирования — только свой. */
export async function getTemplateForEdit(userId: string, id: string) {
  return db.workoutTemplate.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      description: true,
      exercises: {
        orderBy: { order: "asc" },
        select: {
          targetSets: true,
          targetReps: true,
          targetWeight: true,
          restSec: true,
          step: true,
          supersetGroup: true,
          exercise: { select: { id: true, name: true, muscleGroups: true, defaultRestSec: true, archivedAt: true, isBodyweight: true } },
        },
      },
    },
  });
}

export type TemplateForEdit = NonNullable<Awaited<ReturnType<typeof getTemplateForEdit>>>;

/** Цели своей прогрессии по шаблону пользователя (не его шаблон — пусто). */
export async function getOwnTemplateTargets(userId: string, templateId: string) {
  const rows = await db.templateExercise.findMany({
    where: { templateId, template: { userId } },
    orderBy: { order: "asc" },
    select: { exerciseId: true, targetSets: true, targetReps: true, targetWeight: true, step: true, fails: true },
  });
  return ownTargets(rows);
}

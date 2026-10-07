"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { templateItemsFromWorkout } from "@/lib/templates/from-workout";
import { templateSchema, type TemplateInput } from "@/lib/templates/schema";

export type SaveTemplateResult =
  | { ok: true; id: string }
  | { ok: false; error?: string; errors?: Record<string, string[] | undefined> };

function revalidate() {
  revalidatePath("/templates");
  revalidatePath("/training");
}

/** Создать (id = null) или перезаписать свой шаблон целиком. */
export async function saveTemplateAction(id: string | null, input: TemplateInput): Promise<SaveTemplateResult> {
  const user = await requireUser();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: z.flattenError(parsed.error).fieldErrors };
  const { name, description, exercises } = parsed.data;

  const ids = [...new Set(exercises.map((e) => e.exerciseId))];
  const allowed = await db.exercise.count({ where: { id: { in: ids }, OR: [{ userId: null }, { userId: user.id }] } });
  if (allowed !== ids.length) return { ok: false, error: "Неизвестное упражнение" };

  const items = exercises.map((e, order) => ({ ...e, order }));

  if (id) {
    const { count } = await db.workoutTemplate.updateMany({ where: { id, userId: user.id }, data: { name, description } });
    if (count === 0) return { ok: false, error: "Шаблон не найден" };
    await db.$transaction([
      db.templateExercise.deleteMany({ where: { templateId: id } }),
      db.templateExercise.createMany({ data: items.map((e) => ({ ...e, templateId: id })) }),
    ]);
    revalidate();
    return { ok: true, id };
  }

  const created = await db.workoutTemplate.create({
    data: { userId: user.id, name, description, exercises: { create: items } },
    select: { id: true },
  });
  await evaluateAchievementsNow(user.id); // «Своя программа»
  revalidate();
  return { ok: true, id: created.id };
}

export async function deleteTemplateAction(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const { count } = await db.workoutTemplate.deleteMany({ where: { id, userId: user.id } });
  revalidate();
  return { ok: count > 0 };
}

/** Копия готовой программы (или своего шаблона) в «Мои шаблоны» — чтобы её можно было менять. */
export async function copyTemplateAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const source = await db.workoutTemplate.findFirst({
    where: { id, OR: [{ userId: null }, { userId: user.id }] },
    include: { exercises: { orderBy: { order: "asc" }, where: { exercise: { archivedAt: null } } } },
  });
  if (!source) redirect("/templates");

  const copy = await db.workoutTemplate.create({
    data: {
      userId: user.id,
      name: source.userId ? `${source.name} (копия)` : source.name,
      description: source.description,
      exercises: {
        create: source.exercises.map(({ exerciseId, order, targetSets, targetReps, targetWeight, restSec }) => ({
          exerciseId,
          order,
          targetSets,
          targetReps,
          targetWeight,
          restSec,
        })),
      },
    },
    select: { id: true },
  });
  await evaluateAchievementsNow(user.id);
  revalidate();
  redirect(`/templates/${copy.id}`);
}

/**
 * «Добавить недостающие упражнения в шаблон»: состав шаблона заменяется упражнениями
 * завершённой тренировки (порядок, число рабочих подходов, последний вес/повторы, отдых).
 */
export async function updateTemplateFromWorkoutAction(workoutId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id, template: { userId: user.id } },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { sets: { where: { isWarmup: false }, orderBy: { order: "asc" } } },
      },
    },
  });
  if (!workout?.templateId) return { ok: false, error: "Тренировка не связана с вашим шаблоном" };

  const templateId = workout.templateId;
  await db.$transaction([
    db.templateExercise.deleteMany({ where: { templateId } }),
    db.templateExercise.createMany({
      data: templateItemsFromWorkout(workout.exercises).map((item) => ({ ...item, templateId })),
    }),
    db.workoutTemplate.update({ where: { id: templateId }, data: { updatedAt: new Date() } }),
  ]);
  revalidate();
  revalidatePath(`/workouts/${workoutId}`);
  return { ok: true };
}

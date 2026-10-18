"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { visibleExercisesWhere } from "@/lib/exercises/queries";
import { parseExerciseForm, type ExerciseInput } from "@/lib/exercises/schema";

export type ExerciseFormState = {
  success?: boolean;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

const NAME_TAKEN = { errors: { name: ["Упражнение с таким названием уже есть"] } };

export async function saveExerciseAction(
  _prev: ExerciseFormState,
  formData: FormData,
): Promise<ExerciseFormState> {
  const user = await requireUser();
  const parsed = parseExerciseForm(formData);
  if (!parsed.success) return { errors: parsed.errors };

  const { id, kind, ...rest } = parsed.data;
  // Вид — только при флаге workout_formats: без него форма не присылает поле, и вид не трогаем (новое — силовое)
  const formats = await isEnabled("workout_formats", user.id);
  const data = formats ? { ...rest, kind } : rest;
  if (formats && id) {
    const current = await db.exercise.findFirst({ where: { id, userId: user.id }, select: { kind: true } });
    if (current && current.kind !== kind) {
      const used = await db.workoutSet.count({ where: { workoutExercise: { exerciseId: id }, completedAt: { not: null } } });
      if (used > 0) return { message: "Вид нельзя сменить: по упражнению уже есть подходы" };
    }
  }

  // Название должно быть уникальным среди видимых пользователю упражнений (без учёта регистра);
  // без флага встроенные на время и кардио скрыты — их названия не заняты
  const clash = await db.exercise.findFirst({
    where: {
      archivedAt: null,
      OR: [{ userId: null, ...(formats ? {} : { kind: "REPS" as const }) }, { userId: user.id }],
      name: { equals: data.name, mode: "insensitive" },
      ...(id ? { id: { not: id } } : {}),
    },
    select: { id: true },
  });
  if (clash) return NAME_TAKEN;

  try {
    if (id) {
      const { count } = await db.exercise.updateMany({
        where: { id, userId: user.id, archivedAt: null },
        data,
      });
      if (count === 0) return { message: "Упражнение не найдено или его нельзя изменить" };
    } else {
      await createOrRestore(user.id, data);
    }
    if (!id) await evaluateAchievementsNow(user.id); // «Изобретатель»
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NAME_TAKEN;
    throw e;
  }

  revalidatePath("/exercises");
  return { success: true };
}

/**
 * Удалённые упражнения архивируются (история тренировок сохраняется), а unique(userId, name)
 * продолжает действовать — поэтому одноимённое архивное упражнение «воскрешаем».
 */
async function createOrRestore(userId: string, data: Omit<ExerciseInput, "id" | "kind"> & { kind?: ExerciseInput["kind"] }) {
  const archived = await db.exercise.findFirst({
    where: { userId, archivedAt: { not: null }, name: { equals: data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (archived) {
    await db.exercise.update({ where: { id: archived.id }, data: { ...data, archivedAt: null } });
  } else {
    await db.exercise.create({ data: { ...data, userId } });
  }
}

export async function deleteExerciseAction(id: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const { count } = await db.exercise.updateMany({
    where: { id, userId: user.id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (count === 0) return { ok: false, message: "Упражнение не найдено или его нельзя удалить" };

  revalidatePath("/exercises");
  return { ok: true };
}

/** ★ Избранное: явное состояние (идемпотентно — быстрые повторные клики не путают итог). Только видимые пользователю упражнения. */
export async function toggleFavoriteAction(exerciseId: string, favorite: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (typeof exerciseId !== "string" || typeof favorite !== "boolean") return { ok: false, error: "Упражнение не найдено" };
  const visible = await db.exercise.findFirst({ where: { id: exerciseId, ...visibleExercisesWhere(user.id) }, select: { id: true } });
  if (!visible) return { ok: false, error: "Упражнение не найдено" };
  if (favorite) await db.favoriteExercise.createMany({ data: [{ userId: user.id, exerciseId }], skipDuplicates: true });
  else await db.favoriteExercise.deleteMany({ where: { userId: user.id, exerciseId } });
  // Без revalidatePath: он перерисовал бы и /training посреди тренировки (список прыгнул бы, эффект восстановления
  // черновика сработал бы заново); /exercises обновляется сам (refreshAfterSave у провайдера)
  return { ok: true };
}

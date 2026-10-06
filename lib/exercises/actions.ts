"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
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

  const { id, ...data } = parsed.data;

  // Название должно быть уникальным среди видимых пользователю упражнений (без учёта регистра).
  const clash = await db.exercise.findFirst({
    where: {
      archivedAt: null,
      OR: [{ userId: null }, { userId: user.id }],
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
async function createOrRestore(userId: string, data: Omit<ExerciseInput, "id">) {
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

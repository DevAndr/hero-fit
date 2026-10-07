"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { templateItemsFromWorkout } from "@/lib/templates/from-workout";
import { finishWorkout } from "@/lib/workouts/finish";
import { ACTIVE_STATUSES, getLastPerformance } from "@/lib/workouts/queries";
import { clampClientTime, workoutDraftSchema, type WorkoutDraft, type WorkoutDraftParsed } from "@/lib/workouts/schema";

type Result = { ok: true } | { ok: false; error: string };

type PlannedExercise = { exerciseId: string; restSec: number; sets: { weight: number; reps: number }[] };

// ───────────────────────────── Старт ─────────────────────────────

/**
 * source: "empty" | "template:<id>" | "repeat:<workoutId>".
 * Создаёт тренировку в статусе PLANNED — её можно дособрать перед стартом.
 */
export async function createWorkoutAction(formData: FormData) {
  const user = await requireUser();
  const active = await db.workout.findFirst({
    where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (active) redirect("/training");

  const source = String(formData.get("source") ?? "empty");
  const [kind, id] = source.split(":");
  let name = "Тренировка";
  let templateId: string | undefined;
  let planned: PlannedExercise[] = [];

  if (kind === "template" && id) {
    const template = await db.workoutTemplate.findFirst({
      where: { id, OR: [{ userId: user.id }, { userId: null }] },
      include: {
        exercises: {
          orderBy: { order: "asc" },
          where: { exercise: { archivedAt: null } },
          include: { exercise: { select: { defaultRestSec: true } } },
        },
      },
    });
    if (template) {
      name = template.name;
      templateId = template.id;
      const last = await getLastPerformance(user.id, template.exercises.map((e) => e.exerciseId));
      planned = template.exercises.map((te) => {
        // Вес подставляем из прошлой тренировки — пользователю остаётся только подтвердить.
        const lastSets = last[te.exerciseId]?.sets ?? [];
        return {
          exerciseId: te.exerciseId,
          restSec: te.restSec ?? te.exercise.defaultRestSec,
          sets: Array.from({ length: te.targetSets }, (_, i) => ({
            weight: lastSets[i]?.weight ?? lastSets.at(-1)?.weight ?? te.targetWeight ?? 0,
            reps: te.targetReps ?? lastSets[i]?.reps ?? 0,
          })),
        };
      });
    }
  } else if (kind === "repeat" && id) {
    const previous = await db.workout.findFirst({
      where: { id, userId: user.id, status: WorkoutStatus.COMPLETED },
      include: {
        exercises: {
          orderBy: { order: "asc" },
          where: { exercise: { archivedAt: null } },
          include: { sets: { where: { isWarmup: false }, orderBy: { order: "asc" } } },
        },
      },
    });
    if (previous) {
      name = previous.name;
      templateId = previous.templateId ?? undefined;
      planned = previous.exercises.map((we) => ({
        exerciseId: we.exerciseId,
        restSec: we.restSec,
        sets: we.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      }));
    }
  }

  await db.workout.create({
    data: {
      userId: user.id,
      name,
      templateId,
      status: WorkoutStatus.PLANNED,
      exercises: {
        create: planned.map((e, order) => ({
          exerciseId: e.exerciseId,
          order,
          restSec: e.restSec,
          sets: { create: e.sets.map((s, i) => ({ order: i, weight: s.weight, reps: s.reps })) },
        })),
      },
    },
  });

  redirect("/training");
}

// ───────────────────────────── Автосохранение ─────────────────────────────

async function writeDraft(userId: string, workoutId: string, draft: WorkoutDraftParsed): Promise<Result> {
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (!workout) return { ok: false, error: "Тренировка не найдена или уже завершена" };

  // Упражнения должны быть видны пользователю (встроенные или свои, в т.ч. архивные — для истории).
  const ids = [...new Set(draft.exercises.map((e) => e.exerciseId))];
  const allowed = await db.exercise.count({ where: { id: { in: ids }, OR: [{ userId: null }, { userId }] } });
  if (allowed !== ids.length) return { ok: false, error: "Неизвестное упражнение" };

  // Тренировка маленькая (≤ 30 × 50) — проще и надёжнее заменить содержимое целиком.
  await db.$transaction([
    db.workoutExercise.deleteMany({ where: { workoutId } }),
    db.workout.update({
      where: { id: workoutId },
      data: {
        name: draft.name,
        exercises: {
          create: draft.exercises.map((e, order) => ({
            exerciseId: e.exerciseId,
            order,
            restSec: e.restSec,
            sets: {
              create: e.sets.map((s, i) => ({
                order: i,
                weight: s.weight,
                reps: s.reps,
                isWarmup: s.isWarmup,
                rir: s.rir,
                completedAt: s.completedAt ? new Date(s.completedAt) : null,
              })),
            },
          })),
        },
      },
    }),
  ]);
  return { ok: true };
}

export async function saveWorkoutDraftAction(workoutId: string, draft: WorkoutDraft): Promise<Result> {
  const user = await requireUser();
  const parsed = workoutDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "Некорректные данные тренировки" };
  return writeDraft(user.id, workoutId, parsed.data);
}

// ───────────────────────────── Старт / финиш / отмена ─────────────────────────────

const H = 3_600_000;

/** clientStartedAt — время старта с устройства, если начали без сети (не старше 12 ч, не в будущем). */
export async function startWorkoutAction(
  workoutId: string,
  clientStartedAt?: string,
): Promise<Result & { startedAt?: string }> {
  const user = await requireUser();
  const startedAt = clampClientTime(clientStartedAt, new Date(), null, 12 * H);
  const { count } = await db.workout.updateMany({
    where: { id: workoutId, userId: user.id, status: WorkoutStatus.PLANNED },
    data: { status: WorkoutStatus.IN_PROGRESS, startedAt },
  });
  if (count === 0) return { ok: false, error: "Тренировку нельзя начать" };
  return { ok: true, startedAt: startedAt.toISOString() };
}

/** clientFinishedAt — время завершения с устройства, если завершили без сети (не раньше старта, не в будущем). */
export async function finishWorkoutAction(
  workoutId: string,
  draft: WorkoutDraft,
  clientFinishedAt?: string,
): Promise<Result> {
  const user = await requireUser();
  const parsed = workoutDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "Некорректные данные тренировки" };

  const saved = await writeDraft(user.id, workoutId, parsed.data);
  if (!saved.ok) {
    // Двойной клик: первая попытка уже завершила тренировку.
    const done = await db.workout.count({ where: { id: workoutId, userId: user.id, status: WorkoutStatus.COMPLETED } });
    if (!done) return saved;
  } else {
    const workout = await db.workout.findFirst({ where: { id: workoutId, userId: user.id }, select: { startedAt: true } });
    const finishedAt = clampClientTime(clientFinishedAt, new Date(), workout?.startedAt ?? null, 24 * H);
    const result = await finishWorkout(user.id, workoutId, finishedAt);
    if (!result.ok) return result;
  }

  revalidatePath("/", "layout");
  redirect(`/workouts/${workoutId}`);
}

export async function cancelWorkoutAction(workoutId: string) {
  const user = await requireUser();
  await db.workout.deleteMany({ where: { id: workoutId, userId: user.id, status: { in: ACTIVE_STATUSES } } });
  redirect("/training");
}

// ───────────────────────────── Шаблон из тренировки ─────────────────────────────

export async function saveAsTemplateAction(workoutId: string, name: string): Promise<Result> {
  const user = await requireUser();
  const title = name.trim().slice(0, 80);
  if (!title) return { ok: false, error: "Введите название шаблона" };

  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { sets: { where: { isWarmup: false }, orderBy: { order: "asc" } } },
      },
    },
  });
  if (!workout) return { ok: false, error: "Тренировка не найдена" };

  await db.workoutTemplate.create({
    data: {
      userId: user.id,
      name: title,
      exercises: { create: templateItemsFromWorkout(workout.exercises) },
    },
  });
  revalidatePath("/training");
  revalidatePath("/templates");
  return { ok: true };
}

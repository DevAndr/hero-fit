"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { queueGoal, YM_ID } from "@/lib/analytics/queue";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { rollGoblin } from "@/lib/goblin/queries";
import { requireUser } from "@/lib/auth/dal";
import { templateItemsFromWorkout } from "@/lib/templates/from-workout";
import { markOnboarded } from "@/lib/onboarding/complete";
import { finishWorkout } from "@/lib/workouts/finish";
import { createPlannedWorkout } from "@/lib/workouts/create";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";
import { clampClientTime, workoutDraftSchema, type WorkoutDraft, type WorkoutDraftParsed } from "@/lib/workouts/schema";
import { skipOccurrence } from "@/lib/plans/mutations";
import { normalizeGroups } from "@/lib/workouts/supersets";
import { attachGuestWorkout, endSessionOfWorkout } from "@/lib/together/queries";

type Result = { ok: true } | { ok: false; error: string };

// ───────────────────────────── Старт ─────────────────────────────

/**
 * source: "empty" | "template:<id>" | "repeat:<workoutId>" | "plan:<ключ вхождения календаря>" | "recovery".
 * Создаёт тренировку в статусе PLANNED (`createPlannedWorkout`) — её можно дособрать перед стартом.
 */
export async function createWorkoutAction(formData: FormData) {
  const user = await requireUser();
  // Программа из финала экскурсии: экскурсия пройдена, даже если дальше уведёт на активную тренировку
  if (formData.get("onboarding") === "1" && (await markOnboarded(user.id))) await queueGoal("onboarding_done");
  const active = await db.workout.findFirst({
    where: { userId: user.id, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (active) redirect("/training");

  await createPlannedWorkout(user.id, String(formData.get("source") ?? "empty"));
  redirect("/training");
}

// ───────────────────────────── Автосохранение ─────────────────────────────

async function writeDraft(userId: string, workoutId: string, draft: WorkoutDraftParsed): Promise<Result> {
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  if (!workout) return { ok: false, error: "Тренировка не найдена или уже завершена" };

  // Упражнения должны быть видны пользователю (встроенные или свои, в т.ч. архивные — для истории)
  // или уже стоять в этой тренировке — их положил сервер из шаблона тренера (там бывают упражнения тренера).
  const ids = [...new Set(draft.exercises.map((e) => e.exerciseId))];
  const allowed = await db.exercise.count({
    where: { id: { in: ids }, OR: [{ userId: null }, { userId }, { workoutExercises: { some: { workoutId } } }] },
  });
  if (allowed !== ids.length) return { ok: false, error: "Неизвестное упражнение" };

  // Тренировка маленькая (≤ 30 × 50) — проще и надёжнее заменить содержимое целиком.
  await db.$transaction([
    db.workoutExercise.deleteMany({ where: { workoutId } }),
    db.workout.update({
      where: { id: workoutId },
      data: {
        name: draft.name,
        exercises: {
          // Номера групп суперсетов — заново по порядку: клиенту не доверяем
          create: normalizeGroups(draft.exercises).map((e, order) => ({
            exerciseId: e.exerciseId,
            order,
            restSec: e.restSec,
            supersetGroup: e.group,
            sets: {
              create: e.sets.map((s, i) => ({
                order: i,
                weight: s.weight,
                reps: s.reps,
                durationSec: s.durationSec,
                distanceM: s.distanceM,
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

export async function saveWorkoutDraftAction(
  workoutId: string,
  draft: WorkoutDraft,
): Promise<Result & { goblin?: { spawnedAt: string } }> {
  const user = await requireUser();
  const parsed = workoutDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, error: "Некорректные данные тренировки" };
  const saved = await writeDraft(user.id, workoutId, parsed.data);
  if (!saved.ok || !(await isEnabled("golden_goblin", user.id))) return saved;
  // Золотой гоблин: бросок по новым выполненным подходам — уже по сохранённому черновику
  const goblin = await rollGoblin(user.id, workoutId, new Date(), Math.random()).catch((e) => {
    console.error("[goblin] roll failed", e);
    return null;
  });
  return goblin ? { ...saved, goblin } : saved;
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
  // Принял приглашение без тренировки — эта входит в совместную
  if (await isEnabled("together", user.id)) await db.$transaction((tx) => attachGuestWorkout(tx, user.id, workoutId, new Date()));
  await queueGoal("workout_start");
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
    const result = await finishWorkout(user.id, workoutId, finishedAt, { goblin: await isEnabled("golden_goblin", user.id) });
    if (!result.ok) return result;
    if (YM_ID) {
      await queueGoal("workout_finish");
      const completed = await db.workout.count({ where: { userId: user.id, status: WorkoutStatus.COMPLETED } });
      if (completed === 1) await queueGoal("first_workout");
      const goals = await db.goal.count({ where: { userId: user.id, status: "ACHIEVED", achievedAt: finishedAt } });
      if (goals > 0) await queueGoal("goal_achieved");
    }
  }

  revalidatePath("/", "layout");
  redirect(`/workouts/${workoutId}`);
}

/** Отмена активной тренировки; skipPlan — заодно пропустить вхождение календаря, из которого она начата. */
export async function cancelWorkoutAction(workoutId: string, skipPlan = false) {
  const user = await requireUser();
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id, status: { in: ACTIVE_STATUSES } },
    select: { planKey: true },
  });
  if (workout) {
    // Отмена удаляет тренировку — совместная сессия с ней закрывается раньше (партнёр увидит «вышел»)
    await db.$transaction(async (tx) => {
      await endSessionOfWorkout(tx, workoutId, new Date());
      await tx.workout.deleteMany({ where: { id: workoutId, userId: user.id, status: { in: ACTIVE_STATUSES } } });
    });
    if (skipPlan === true && workout.planKey) await skipOccurrence(user.id, workout.planKey);
  }
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
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

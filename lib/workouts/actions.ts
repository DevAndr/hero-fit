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
import { getOccurrence } from "@/lib/plans/queries";
import { recoveryWorkoutName } from "@/lib/progress/recovery-plan";
import { getRecoveryPlan } from "@/lib/progress/recovery-queries";
import { templateAccessible } from "@/lib/coach/templates";
import { getTemplateTargets } from "@/lib/coach/target-queries";
import { plannedSets, type Target } from "@/lib/coach/targets";
import { ownTargets } from "@/lib/templates/progression";
import { getOwnTemplateTargets } from "@/lib/templates/queries";
import { markOnboarded } from "@/lib/onboarding/complete";
import { finishWorkout } from "@/lib/workouts/finish";
import { ACTIVE_STATUSES, getLastPerformance } from "@/lib/workouts/queries";
import { clampClientTime, workoutDraftSchema, type WorkoutDraft, type WorkoutDraftParsed } from "@/lib/workouts/schema";
import { skipOccurrence } from "@/lib/plans/mutations";
import { normalizeGroups } from "@/lib/workouts/supersets";
import { plannedTimedSets } from "@/lib/workouts/kinds";

type Result = { ok: true } | { ok: false; error: string };

/** `group` — суперсет из шаблона или прошлой тренировки; план календаря — без групп. */
type PlannedExercise = {
  exerciseId: string;
  restSec: number;
  group?: number | null;
  sets: { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null }[];
};

// ───────────────────────────── Старт ─────────────────────────────

/** Упражнения из шаблона (свой, встроенный или назначенный тренером); вес — из цели прогрессии, задания тренера или прошлой тренировки. */
async function fromTemplate(userId: string, id: string, day?: string): Promise<{ name: string; templateId: string; planned: PlannedExercise[] } | null> {
  if (!(await templateAccessible(userId, id))) return null;
  const template = await db.workoutTemplate.findUnique({
    where: { id },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        where: { exercise: { archivedAt: null } },
        include: { exercise: { select: { defaultRestSec: true } } },
      },
    },
  });
  if (!template) return null;
  const [last, targets] = await Promise.all([
    getLastPerformance(userId, template.exercises.map((e) => e.exerciseId)),
    // Свой шаблон — цели своей прогрессии; шаблон тренера — его задания
    template.userId === userId ? ownTargets(template.exercises) : getTemplateTargets(userId, template.id, day),
  ]);
  return {
    name: template.name,
    templateId: template.id,
    // Вес — из задания тренера или прошлой тренировки: пользователю остаётся только подтвердить.
    planned: template.exercises.map((te) => ({
      exerciseId: te.exerciseId,
      restSec: te.restSec ?? te.exercise.defaultRestSec,
      group: te.supersetGroup,
      sets: plannedSets(te, last[te.exerciseId]?.sets ?? [], targets.get(te.exerciseId)),
    })),
  };
}

/**
 * source: "empty" | "template:<id>" | "repeat:<workoutId>" | "plan:<ключ вхождения календаря>".
 * Создаёт тренировку в статусе PLANNED — её можно дособрать перед стартом.
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

  const source = String(formData.get("source") ?? "empty");
  const [kind, id] = source.split(":");
  let name = "Тренировка";
  let templateId: string | undefined;
  let planned: PlannedExercise[] = [];

  let planKey: string | undefined;

  if (kind === "template" && id) {
    const fromTpl = await fromTemplate(user.id, id);
    if (fromTpl) ({ name, templateId, planned } = fromTpl);
  } else if (kind === "plan") {
    // Ключ вхождения сам содержит «:» — берём всё после «plan:»
    const key = source.slice("plan:".length);
    const found = await getOccurrence(user.id, key);
    if (found) {
      planKey = key;
      name = found.occurrence.title;
      // Шаблон удалён или недоступен — пустая тренировка с названием плана
      // Неделя программы тренера — по дате вхождения
      const fromTpl = found.occurrence.templateId ? await fromTemplate(user.id, found.occurrence.templateId, found.occurrence.date) : null;
      if (fromTpl) ({ templateId, planned } = fromTpl);
    }
  } else if (kind === "recovery") {
    const plan = await getRecoveryPlan(user.id);
    if (plan.exercises.length) {
      name = recoveryWorkoutName(plan.groups);
      const last = await getLastPerformance(user.id, plan.exercises.map((e) => e.id));
      // Подходы, веса и повторы — из прошлого раза; без истории — 3 × 10, вес пустой
      planned = plan.exercises.map((e) => ({
        exerciseId: e.id,
        restSec: e.restSec,
        sets: last[e.id]?.sets.length ? last[e.id].sets : Array.from({ length: 3 }, () => ({ weight: 0, reps: 10 })),
      }));
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
      // Поверх прошлого раза — цели своей прогрессии или задания активного тренера (прогрессия могла сдвинуть вес)
      const own = templateId ? await getOwnTemplateTargets(user.id, templateId) : new Map<string, Target>();
      const targets = own.size ? own : templateId ? await getTemplateTargets(user.id, templateId) : new Map<string, Target>();
      planned = previous.exercises.map((we) => {
        const sets = we.sets.map((s) => ({ weight: s.weight, reps: s.reps }));
        const target = targets.get(we.exerciseId);
        return {
          exerciseId: we.exerciseId,
          restSec: we.restSec,
          group: we.supersetGroup,
          sets: target ? plannedSets({ targetSets: sets.length, targetReps: null, targetWeight: null }, sets, target) : sets,
        };
      });
    }
  }

  // На время и кардио: без веса и повторов (их мог дать шаблон, задание тренера или план), время и дистанция — как в прошлый раз
  const timedIds = new Set(
    (await db.exercise.findMany({ where: { id: { in: planned.map((e) => e.exerciseId) }, kind: { not: "REPS" } }, select: { id: true } })).map((e) => e.id),
  );
  if (timedIds.size) {
    const lastTimed = await getLastPerformance(user.id, [...timedIds]);
    planned = planned.map((e) => (timedIds.has(e.exerciseId) ? { ...e, sets: plannedTimedSets(e.sets.length || 1, lastTimed[e.exerciseId]?.sets ?? []) } : e));
  }

  await db.workout.create({
    data: {
      userId: user.id,
      name,
      templateId,
      planKey,
      status: WorkoutStatus.PLANNED,
      exercises: {
        // Архивные упражнения выпали из шаблона/повтора — группы суперсетов пересчитываются
        create: normalizeGroups(planned.map((e) => ({ ...e, group: e.group ?? null }))).map((e, order) => ({
          exerciseId: e.exerciseId,
          order,
          restSec: e.restSec,
          supersetGroup: e.group,
          sets: {
            create: e.sets.map((s, i) => ({ order: i, weight: s.weight, reps: s.reps, durationSec: s.durationSec ?? null, distanceM: s.distanceM ?? null })),
          },
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
    await db.workout.deleteMany({ where: { id: workoutId, userId: user.id, status: { in: ACTIVE_STATUSES } } });
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

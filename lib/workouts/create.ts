import "server-only";

import { WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getOccurrence } from "@/lib/plans/queries";
import { recoveryWorkoutName } from "@/lib/progress/recovery-plan";
import { getRecoveryPlan } from "@/lib/progress/recovery-queries";
import { templateAccessible } from "@/lib/coach/templates";
import { getTemplateTargets } from "@/lib/coach/target-queries";
import { plannedSets, type Target } from "@/lib/coach/targets";
import { ownTargets } from "@/lib/templates/progression";
import { getOwnTemplateTargets } from "@/lib/templates/queries";
import { getLastPerformance } from "@/lib/workouts/queries";
import { normalizeGroups } from "@/lib/workouts/supersets";
import { plannedTimedSets } from "@/lib/workouts/kinds";

/** `group` — суперсет из шаблона или прошлой тренировки; план календаря — без групп. */
type PlannedExercise = {
  exerciseId: string;
  restSec: number;
  group?: number | null;
  sets: { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null }[];
};

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
    // Свой шаблон — цели своей прогрессии (копия из каталога с идущей программой — веса недели); шаблон тренера — его задания
    getTemplateTargets(userId, template.id, day).then((t) => (template.userId === userId && !t.size ? ownTargets(template.exercises) : t)),
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
 * source: "empty" | "template:<id>" | "repeat:<workoutId>" | "plan:<ключ вхождения календаря>" | "recovery".
 * Создаёт тренировку в статусе PLANNED — её можно дособрать перед стартом. Активную тренировку проверяет вызывающий.
 */
export async function createPlannedWorkout(userId: string, source: string): Promise<void> {
  const [kind, id] = source.split(":");
  let name = "Тренировка";
  let templateId: string | undefined;
  let planned: PlannedExercise[] = [];

  let planKey: string | undefined;

  if (kind === "template" && id) {
    const fromTpl = await fromTemplate(userId, id);
    if (fromTpl) ({ name, templateId, planned } = fromTpl);
  } else if (kind === "plan") {
    // Ключ вхождения сам содержит «:» — берём всё после «plan:»
    const key = source.slice("plan:".length);
    const found = await getOccurrence(userId, key);
    if (found) {
      planKey = key;
      name = found.occurrence.title;
      // Шаблон удалён или недоступен — пустая тренировка с названием плана
      // Неделя программы тренера — по дате вхождения
      const fromTpl = found.occurrence.templateId ? await fromTemplate(userId, found.occurrence.templateId, found.occurrence.date) : null;
      if (fromTpl) ({ templateId, planned } = fromTpl);
    }
  } else if (kind === "recovery") {
    const plan = await getRecoveryPlan(userId);
    if (plan.exercises.length) {
      name = recoveryWorkoutName(plan.groups);
      const last = await getLastPerformance(userId, plan.exercises.map((e) => e.id));
      // Подходы, веса и повторы — из прошлого раза; без истории — 3 × 10, вес пустой
      planned = plan.exercises.map((e) => ({
        exerciseId: e.id,
        restSec: e.restSec,
        sets: last[e.id]?.sets.length ? last[e.id].sets : Array.from({ length: 3 }, () => ({ weight: 0, reps: 10 })),
      }));
    }
  } else if (kind === "repeat" && id) {
    const previous = await db.workout.findFirst({
      where: { id, userId, status: WorkoutStatus.COMPLETED },
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
      const own = templateId ? await getOwnTemplateTargets(userId, templateId) : new Map<string, Target>();
      const targets = own.size ? own : templateId ? await getTemplateTargets(userId, templateId) : new Map<string, Target>();
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
    const lastTimed = await getLastPerformance(userId, [...timedIds]);
    planned = planned.map((e) => (timedIds.has(e.exerciseId) ? { ...e, sets: plannedTimedSets(e.sets.length || 1, lastTimed[e.exerciseId]?.sets ?? []) } : e));
  }

  await db.workout.create({
    data: {
      userId,
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
}

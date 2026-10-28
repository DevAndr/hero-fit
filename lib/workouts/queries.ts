import "server-only";
import type { ExerciseKindName } from "@/lib/workouts/kinds";
import { WorkoutStatus, type MuscleGroup, type StretchZone } from "@/generated/prisma/enums";
import { getAssignedTemplates } from "@/lib/coach/templates";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { stretchOnlyWhere } from "@/lib/templates/queries";

export const ACTIVE_STATUSES = [WorkoutStatus.PLANNED, WorkoutStatus.IN_PROGRESS];

export type ExerciseInfo = { id: string; name: string; muscleGroups: MuscleGroup[]; isBodyweight: boolean; /** Только у растяжки; первая — основная. */ stretchZones?: StretchZone[]; /** Растяжка на каждую сторону отдельно. */ perSide?: boolean; /** Нет — силовое (REPS). */ kind?: ExerciseKindName };

/** Сериализуемое состояние активной тренировки для клиентского редактора. */
export type ActiveWorkout = {
  id: string;
  name: string;
  status: "PLANNED" | "IN_PROGRESS";
  startedAt: string | null;
  /** Когда сервер последний раз сохранял тренировку — сравнивается с черновиком на устройстве. */
  updatedAt: string;
  /** Ключ вхождения календаря, из которого начата тренировка. */
  planKey: string | null;
  templateId: string | null;
  /** Самочувствие из чек-ина помощника. */
  wellbeing?: "GREAT" | "OK" | "TIRED" | null;
  /** Золотой гоблин этой тренировки (показывается только при флаге golden_goblin). */
  goblin?: { spawnedAt: string } | null;
  exercises: {
    exercise: ExerciseInfo;
    restSec: number;
    /** Суперсет/круг (lib/workouts/supersets.ts). */
    group: number | null;
    sets: { weight: number; reps: number; durationSec: number | null; distanceM: number | null; isWarmup: boolean; rir: number | null; completedAt: string | null }[];
  }[];
};

const exerciseInfoSelect = { id: true, name: true, muscleGroups: true, stretchZones: true, perSide: true, isBodyweight: true, kind: true } as const;

export async function getActiveWorkout(userId: string): Promise<ActiveWorkout | null> {
  const workout = await db.workout.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: {
      goblin: { select: { spawnedAt: true } },
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: exerciseInfoSelect }, sets: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!workout) return null;

  return {
    id: workout.id,
    planKey: workout.planKey,
    templateId: workout.templateId,
    wellbeing: workout.wellbeing,
    goblin: workout.goblin ? { spawnedAt: workout.goblin.spawnedAt.toISOString() } : null,
    name: workout.name,
    status: workout.status as ActiveWorkout["status"],
    startedAt: workout.startedAt?.toISOString() ?? null,
    updatedAt: workout.updatedAt.toISOString(),
    exercises: workout.exercises.map((we) => ({
      exercise: we.exercise,
      restSec: we.restSec,
      group: we.supersetGroup,
      sets: we.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        durationSec: s.durationSec,
        distanceM: s.distanceM,
        isWarmup: s.isWarmup,
        rir: s.rir,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export type LastPerformance = Record<string, { date: string; sets: { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null }[] }>;

/** Рабочие подходы из последней завершённой тренировки для каждого упражнения. */
export async function getLastPerformance(userId: string, exerciseIds: string[]): Promise<LastPerformance> {
  if (exerciseIds.length === 0) return {};
  const rows = await db.workoutExercise.findMany({
    where: { exerciseId: { in: exerciseIds }, workout: { userId, status: WorkoutStatus.COMPLETED } },
    orderBy: [{ workout: { finishedAt: "desc" } }, { order: "asc" }],
    distinct: ["exerciseId"],
    select: {
      exerciseId: true,
      workout: { select: { finishedAt: true } },
      sets: {
        where: { isWarmup: false, completedAt: { not: null } },
        orderBy: { order: "asc" },
        select: { weight: true, reps: true, durationSec: true, distanceM: true },
      },
    },
  });
  return Object.fromEntries(
    rows.map((r) => [r.exerciseId, { date: r.workout.finishedAt?.toISOString() ?? "", sets: r.sets }]),
  );
}

export async function getStartOptions(userId: string) {
  const stretching = await isEnabled("stretching", userId);
  const [templates, lastWorkout, coachTemplates] = await Promise.all([
    db.workoutTemplate.findMany({
      // Готовые программы из одной растяжки — только при флаге stretching
      where: { OR: [{ userId }, { userId: null, ...(stretching ? {} : { NOT: stretchOnlyWhere }) }] },
      orderBy: [{ userId: { sort: "desc", nulls: "last" } }, { program: "asc" }, { name: "asc" }],
      select: {
        id: true,
        userId: true,
        name: true,
        program: true,
        description: true,
        exercises: {
          orderBy: { order: "asc" },
          select: { targetSets: true, exercise: { select: { name: true } } },
        },
      },
    }),
    db.workout.findFirst({
      where: { userId, status: WorkoutStatus.COMPLETED },
      orderBy: { finishedAt: "desc" },
      select: { id: true, name: true, finishedAt: true, _count: { select: { exercises: true } } },
    }),
    getAssignedTemplates(userId),
  ]);
  return { templates, lastWorkout, coachTemplates };
}

export type StartOptions = Awaited<ReturnType<typeof getStartOptions>>;

export async function getWorkoutSummary(userId: string, workoutId: string) {
  return db.workout.findFirst({
    where: { id: workoutId, userId, status: WorkoutStatus.COMPLETED },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: { select: { name: true, muscleGroups: true, kind: true } },
          sets: { orderBy: { order: "asc" } },
        },
      },
      xpEvents: { where: { reason: "WORKOUT_COMPLETED" }, select: { meta: true }, take: 1 },
      template: {
        select: {
          userId: true,
          name: true,
          exercises: { orderBy: { order: "asc" }, select: { exerciseId: true, targetSets: true, supersetGroup: true } },
        },
      },
    },
  });
}


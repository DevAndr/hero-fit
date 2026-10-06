import "server-only";
import { WorkoutStatus, type MuscleGroup } from "@/generated/prisma/enums";
import { db } from "@/lib/db";

export const ACTIVE_STATUSES = [WorkoutStatus.PLANNED, WorkoutStatus.IN_PROGRESS];

export type ExerciseInfo = { id: string; name: string; muscleGroups: MuscleGroup[]; isBodyweight: boolean };

/** Сериализуемое состояние активной тренировки для клиентского редактора. */
export type ActiveWorkout = {
  id: string;
  name: string;
  status: "PLANNED" | "IN_PROGRESS";
  startedAt: string | null;
  exercises: {
    exercise: ExerciseInfo;
    restSec: number;
    sets: { weight: number; reps: number; isWarmup: boolean; completedAt: string | null }[];
  }[];
};

const exerciseInfoSelect = { id: true, name: true, muscleGroups: true, isBodyweight: true } as const;

export async function getActiveWorkout(userId: string): Promise<ActiveWorkout | null> {
  const workout = await db.workout.findFirst({
    where: { userId, status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "desc" },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: { exercise: { select: exerciseInfoSelect }, sets: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!workout) return null;

  return {
    id: workout.id,
    name: workout.name,
    status: workout.status as ActiveWorkout["status"],
    startedAt: workout.startedAt?.toISOString() ?? null,
    exercises: workout.exercises.map((we) => ({
      exercise: we.exercise,
      restSec: we.restSec,
      sets: we.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        isWarmup: s.isWarmup,
        completedAt: s.completedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export type LastPerformance = Record<string, { date: string; sets: { weight: number; reps: number }[] }>;

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
        select: { weight: true, reps: true },
      },
    },
  });
  return Object.fromEntries(
    rows.map((r) => [r.exerciseId, { date: r.workout.finishedAt?.toISOString() ?? "", sets: r.sets }]),
  );
}

export async function getStartOptions(userId: string) {
  const [templates, lastWorkout] = await Promise.all([
    db.workoutTemplate.findMany({
      where: { OR: [{ userId }, { userId: null }] },
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
  ]);
  return { templates, lastWorkout };
}

export type StartOptions = Awaited<ReturnType<typeof getStartOptions>>;

export async function getWorkoutSummary(userId: string, workoutId: string) {
  return db.workout.findFirst({
    where: { id: workoutId, userId, status: WorkoutStatus.COMPLETED },
    include: {
      exercises: {
        orderBy: { order: "asc" },
        include: {
          exercise: { select: { name: true, muscleGroups: true } },
          sets: { orderBy: { order: "asc" } },
        },
      },
      xpEvents: { where: { reason: "WORKOUT_COMPLETED" }, select: { meta: true }, take: 1 },
      template: {
        select: {
          userId: true,
          name: true,
          exercises: { orderBy: { order: "asc" }, select: { exerciseId: true, targetSets: true } },
        },
      },
    },
  });
}


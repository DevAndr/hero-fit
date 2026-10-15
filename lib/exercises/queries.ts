import "server-only";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import type { ExerciseKindName } from "@/lib/workouts/kinds";

export const exerciseSelect = {
  id: true,
  userId: true,
  name: true,
  description: true,
  muscleGroups: true,
  isBodyweight: true,
  kind: true,
  defaultRestSec: true,
} as const;

export type ExerciseItem = {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  muscleGroups: MuscleGroup[];
  isBodyweight: boolean;
  kind: ExerciseKindName;
  defaultRestSec: number;
};

/** Встроенные + свои неархивные упражнения пользователя. */
export function visibleExercisesWhere(userId: string) {
  return { archivedAt: null, OR: [{ userId: null }, { userId }] };
}

export async function listExercises(
  userId: string,
  filter: { q?: string; group?: MuscleGroup } = {},
): Promise<ExerciseItem[]> {
  // Упражнения на время и кардио — только при флаге workout_formats
  const formats = await isEnabled("workout_formats", userId);
  return db.exercise.findMany({
    where: {
      ...visibleExercisesWhere(userId),
      ...(formats ? {} : { kind: "REPS" as const }),
      ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" as const } } : {}),
      ...(filter.group ? { muscleGroups: { has: filter.group } } : {}),
    },
    select: exerciseSelect,
    orderBy: { name: "asc" },
  });
}

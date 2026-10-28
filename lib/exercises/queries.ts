import "server-only";
import type { ExerciseKind, MuscleGroup, StretchZone } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { sortFavoritesFirst } from "@/lib/exercises/favorites";
import type { ExerciseKindName } from "@/lib/workouts/kinds";

export const exerciseSelect = {
  id: true,
  userId: true,
  name: true,
  description: true,
  muscleGroups: true,
  stretchZones: true,
  perSide: true,
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
  /** Только у STRETCH; первая — основная. */
  stretchZones: StretchZone[];
  perSide: boolean;
  isBodyweight: boolean;
  kind: ExerciseKindName;
  defaultRestSec: number;
  /** ★ в избранном у пользователя — первыми в списках. */
  favorite: boolean;
};

/** Встроенные + свои неархивные упражнения пользователя. */
export function visibleExercisesWhere(userId: string) {
  return { archivedAt: null, OR: [{ userId: null }, { userId }] };
}

/** Виды, скрытые флагами: TIME/CARDIO — без workout_formats, STRETCH — без stretching (флаги независимы). */
export function hiddenKinds(formats: boolean, stretching: boolean): ExerciseKind[] {
  return [...(formats ? [] : (["TIME", "CARDIO"] as const)), ...(stretching ? [] : (["STRETCH"] as const))];
}

export async function listExercises(
  userId: string,
  filter: { q?: string; group?: MuscleGroup | "STRETCH" } = {},
): Promise<ExerciseItem[]> {
  // Упражнения на время и кардио — только при флаге workout_formats, растяжка — при stretching
  const [formats, stretching] = await Promise.all([isEnabled("workout_formats", userId), isEnabled("stretching", userId)]);
  const hidden = hiddenKinds(formats, stretching);
  const rows = await db.exercise.findMany({
    where: {
      ...visibleExercisesWhere(userId),
      ...(hidden.length ? { kind: { notIn: hidden } } : {}),
      ...(filter.q ? { name: { contains: filter.q, mode: "insensitive" as const } } : {}),
      ...(filter.group === "STRETCH" ? { kind: "STRETCH" as const } : filter.group ? { muscleGroups: { has: filter.group } } : {}),
    },
    select: { ...exerciseSelect, favorites: { where: { userId }, select: { userId: true } } },
    orderBy: { name: "asc" },
  });
  return sortFavoritesFirst(rows.map(({ favorites, ...e }) => ({ ...e, favorite: favorites.length > 0 })));
}

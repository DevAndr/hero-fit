import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { shouldSpawn } from "@/lib/goblin/rules";

/**
 * Бросок на появление гоблина после отмеченного подхода: своя идущая тренировка, без гоблина, со второго рабочего
 * подхода, раз в 14 дней, шанс. Флаг проверяет вызывающий. Одна встреча на тренировку держит уникальный workoutId.
 */
export async function rollGoblin(userId: string, workoutId: string, now: Date, random: number): Promise<{ spawnedAt: string } | null> {
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId, status: WorkoutStatus.IN_PROGRESS },
    select: { id: true, goblin: { select: { id: true } } },
  });
  if (!workout) return null;
  const [completedWorkingSets, last] = await Promise.all([
    db.workoutSet.count({ where: { workoutExercise: { workoutId }, isWarmup: false, completedAt: { not: null } } }),
    db.goblinEncounter.findFirst({ where: { userId }, orderBy: { spawnedAt: "desc" }, select: { spawnedAt: true } }),
  ]);
  if (!shouldSpawn({ now, lastSpawnedAt: last?.spawnedAt ?? null, hasEncounter: Boolean(workout.goblin), completedWorkingSets, random })) {
    return null;
  }
  try {
    const created = await db.goblinEncounter.create({ data: { userId, workoutId, spawnedAt: now }, select: { spawnedAt: true } });
    return { spawnedAt: created.spawnedAt.toISOString() };
  } catch (e) {
    // Двойной вызов: гоблин этой тренировки уже есть
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Бестиарий «Редкие»: сколько раз встречен, пойман и когда впервые. */
export async function getGoblinStats(userId: string) {
  const [seen, caught, first] = await Promise.all([
    db.goblinEncounter.count({ where: { userId } }),
    db.goblinEncounter.count({ where: { userId, caughtAt: { not: null } } }),
    db.goblinEncounter.findFirst({ where: { userId, caughtAt: { not: null } }, orderBy: { caughtAt: "asc" }, select: { caughtAt: true } }),
  ]);
  return { seen, caught, firstCaughtAt: first?.caughtAt ?? null };
}

/** Состояние сундука гоблина тренировки для итогов: null — гоблина не было. */
export function goblinOfWorkout(userId: string, workoutId: string) {
  return db.goblinEncounter.findFirst({ where: { userId, workoutId }, select: { id: true, caughtAt: true, rewardOpenedAt: true } });
}

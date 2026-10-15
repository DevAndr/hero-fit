import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { GOBLIN_SET_CHANCE, rollsFor, shouldSpawn } from "@/lib/goblin/rules";

/** Шанс за бросок: в e2e GOBLIN_SET_CHANCE=1 (флаг там — только у тестовых пользователей гоблина). */
const chance = () => {
  const v = Number(process.env.GOBLIN_SET_CHANCE);
  return Number.isFinite(v) && v >= 0 && v <= 1 && process.env.GOBLIN_SET_CHANCE ? v : GOBLIN_SET_CHANCE;
};

/**
 * Бросок после сохранения черновика (флаг проверяет вызывающий): по одному на каждый новый выполненный рабочий
 * подход с повторами сверх уже разыгранных (`Workout.goblinRolledSets` — повторная отметка броска не даёт), одна
 * встреча на тренировку (уникальный workoutId), пауза 14 дней по `User.goblinLastAt` (отмена тренировки её не сбрасывает).
 */
export async function rollGoblin(userId: string, workoutId: string, now: Date, random: number): Promise<{ spawnedAt: string } | null> {
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId, status: WorkoutStatus.IN_PROGRESS },
    select: { goblinRolledSets: true, goblin: { select: { id: true } }, user: { select: { goblinLastAt: true } } },
  });
  if (!workout || workout.goblin) return null;
  const completed = await db.workoutSet.count({
    where: { workoutExercise: { workoutId }, isWarmup: false, reps: { gt: 0 }, completedAt: { not: null } },
  });
  const rolls = rollsFor({ rolledSets: workout.goblinRolledSets, completed });
  if (rolls <= 0) return null;
  // Разыгранные подходы — условно: из двух одновременных сохранений бросает одно
  const claimed = await db.workout.updateMany({
    where: { id: workoutId, goblinRolledSets: workout.goblinRolledSets },
    data: { goblinRolledSets: completed },
  });
  if (claimed.count !== 1) return null;
  const spawn = shouldSpawn({ now, lastSpawnedAt: workout.user.goblinLastAt, hasEncounter: false, rolls, random, chance: chance() });
  if (!spawn) return null;
  try {
    const created = await db.$transaction(async (tx) => {
      const encounter = await tx.goblinEncounter.create({ data: { userId, workoutId, spawnedAt: now }, select: { spawnedAt: true } });
      await tx.user.update({ where: { id: userId }, data: { goblinLastAt: now } });
      return encounter;
    });
    return { spawnedAt: created.spawnedAt.toISOString() };
  } catch (e) {
    // Гоблин этой тренировки уже есть
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

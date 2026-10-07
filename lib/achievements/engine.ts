import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { earnedAchievements, type AchievementStats, type ExerciseStats } from "@/lib/achievements/definitions";
import { notify } from "@/lib/notifications/service";
import { levelProgress } from "@/lib/progress/level";

type Client = Prisma.TransactionClient;

export type NewAchievement = { code: string; title: string; description: string; xpReward: number };

/** Статистика по упражнениям из истории: базовый вес (первая тренировка), лучший вес, макс. подходов. */
async function exerciseStats(client: Client, userId: string): Promise<ExerciseStats[]> {
  const rows = await client.$queryRaw<
    { id: string; name: string; baseline: number | null; best: number | null; maxSets: number }[]
  >`
    WITH per_workout AS (
      SELECT we."exerciseId" AS id, w.id AS wid, w."finishedAt" AS at,
             MAX(s.weight) AS top, COUNT(*)::int AS sets
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId}
        AND w.status = 'COMPLETED'
        AND s."isWarmup" = false
        AND s."completedAt" IS NOT NULL
        AND s.reps > 0
      GROUP BY we."exerciseId", w.id, w."finishedAt"
    )
    SELECT p.id, e.name,
           (ARRAY_AGG(p.top ORDER BY p.at))[1] AS baseline,
           MAX(p.top) AS best,
           MAX(p.sets)::int AS "maxSets"
    FROM per_workout p
    JOIN "Exercise" e ON e.id = p.id
    GROUP BY p.id, e.name
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseline: r.baseline ?? 0,
    best: r.best ?? 0,
    maxSetsInWorkout: r.maxSets,
  }));
}

export async function getAchievementStats(client: Client, userId: string): Promise<AchievementStats> {
  const [user, workouts, exercises] = await Promise.all([
    client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { longestStreak: true, currentStreak: true, loginStreak: true },
    }),
    client.workout.count({ where: { userId, status: WorkoutStatus.COMPLETED } }),
    exerciseStats(client, userId),
  ]);
  return { workouts, ...user, exercises };
}

/**
 * Выдаёт все ачивки, которых пользователь достиг, но ещё не получил, и начисляет за них XP.
 * Идемпотентно: unique(userId, code) + skipDuplicates.
 */
export async function evaluateAchievements(
  client: Client,
  userId: string,
): Promise<{ achievements: NewAchievement[]; xp: number }> {
  const stats = await getAchievementStats(client, userId);
  const earned = earnedAchievements(stats);
  if (earned.length === 0) return { achievements: [], xp: 0 };

  const existing = await client.userAchievement.findMany({
    where: { userId, code: { in: earned.map((a) => a.code) } },
    select: { code: true },
  });
  const have = new Set(existing.map((a) => a.code));
  const fresh = earned.filter((a) => !have.has(a.code));
  if (fresh.length === 0) return { achievements: [], xp: 0 };

  const { count } = await client.userAchievement.createMany({
    data: fresh.map((a) => ({ userId, ...a })),
    skipDuplicates: true,
  });
  // Параллельный запрос мог успеть выдать часть — тогда XP не начисляем, чтобы не задвоить.
  if (count !== fresh.length) return { achievements: [], xp: 0 };

  const prefs = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyAchievements: true } });
  for (const a of fresh) {
    await notify(
      client,
      userId,
      { type: NotificationType.ACHIEVEMENT, title: `🏆 ${a.title}`, body: `${a.description} · +${a.xpReward} XP`, url: "/achievements" },
      { push: prefs.notifyAchievements },
    );
  }

  const xp = fresh.reduce((sum, a) => sum + a.xpReward, 0);
  await client.xpEvent.create({
    data: { userId, amount: xp, reason: XpReason.ACHIEVEMENT, meta: { codes: fresh.map((a) => a.code) } },
  });
  const user = await client.user.update({ where: { id: userId }, data: { xp: { increment: xp } }, select: { xp: true } });
  await client.user.update({ where: { id: userId }, data: { level: levelProgress(user.xp).level } });

  return {
    achievements: fresh.map(({ code, title, description, xpReward }) => ({ code, title, description, xpReward })),
    xp,
  };
}

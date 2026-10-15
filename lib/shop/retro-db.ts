import "server-only";
import { db } from "@/lib/db";
import { levelProgress } from "@/lib/progress/level";
import { safeTimeZone } from "@/lib/daily-login";
import { retroCoins } from "@/lib/shop/retro";

/**
 * Стартовый баланс по истории до `User.coinsSince` — один раз на пользователя. Запись `retro` ставится
 * напрямую с ON CONFLICT: при нуле она всё равно нужна (чтобы не считать снова), а вторая параллельная
 * транзакция ничего не начислит. Возвращает начисленное (0, если уже было).
 */
export async function ensureRetroCoins(userId: string): Promise<number> {
  const has = await db.coinTx.findUnique({ where: { userId_key: { userId, key: "retro" } }, select: { id: true } });
  if (has) return 0;

  return db.$transaction(async (tx) => {
    const [user] = await tx.$queryRaw<{ xp: number; timeZone: string | null; coinsSince: Date }[]>`
      SELECT xp, "timeZone", "coinsSince" FROM "User" WHERE id = ${userId} FOR UPDATE`;
    if (!user) return 0;
    const tz = safeTimeZone(user.timeZone ?? undefined);

    const days = await tx.$queryRaw<{ day: string; workouts: number }[]>`
      SELECT to_char((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day, COUNT(*)::int AS workouts
      FROM "Workout" w
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" < ${user.coinsSince}
        AND NOT EXISTS (SELECT 1 FROM "CoinTx" c WHERE c."userId" = w."userId" AND c.key = 'workout:' || w.id)
        AND (SELECT COUNT(*) FROM "WorkoutSet" s JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
             WHERE we."workoutId" = w.id AND s."completedAt" IS NOT NULL AND NOT s."isWarmup" AND (s.reps > 0 OR s."durationSec" > 0)) >= 3
      GROUP BY 1`;

    const records = await tx.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT r->>'exerciseId')::int AS n
      FROM "XpEvent" e
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(e.meta->'records') = 'array' THEN e.meta->'records' ELSE '[]'::jsonb END) r
      WHERE e."userId" = ${userId} AND e.reason = 'PERSONAL_RECORD'::"XpReason" AND e."createdAt" < ${user.coinsSince}
        AND e."workoutId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "CoinTx" c WHERE c."userId" = e."userId" AND c.key = 'workout:' || e."workoutId")
      GROUP BY e."workoutId"`;

    const achievements = await tx.$queryRaw<{ xp: number }[]>`
      SELECT "xpReward" AS xp FROM "UserAchievement" WHERE "userId" = ${userId} AND "earnedAt" < ${user.coinsSince}`;

    const [after] = await tx.$queryRaw<{ s: number }[]>`
      SELECT COALESCE(SUM(amount), 0)::int AS s FROM "XpEvent" WHERE "userId" = ${userId} AND "createdAt" >= ${user.coinsSince}`;
    const level = levelProgress(Math.max(0, user.xp - (after?.s ?? 0))).level;

    const amount = retroCoins({
      workoutsPerDay: days,
      recordExercisesPerWorkout: records.map((r) => r.n),
      achievementXp: achievements.map((a) => a.xp),
      level,
    });

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "CoinTx" (id, "userId", amount, reason, key, meta)
      VALUES (gen_random_uuid()::text, ${userId}, ${amount}, 'RETRO'::"CoinReason", 'retro', ${JSON.stringify({ level })}::jsonb)
      ON CONFLICT ("userId", key) DO NOTHING
      RETURNING id`;
    if (inserted.length === 0 || amount <= 0) return 0;
    await tx.user.update({ where: { id: userId }, data: { coins: { increment: amount } } });
    return amount;
  });
}

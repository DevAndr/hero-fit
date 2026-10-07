import type { Prisma } from "../../generated/prisma/client";
import { safeTimeZone } from "../daily-login";
import { MAX_REWARD_FREEZES, streakFromHistory, weekKey } from "./weekly-streak";

// Относительные импорты — модуль используют и скрипты (сид, миграция серий) вне Next.
type Client = Prisma.TransactionClient;

/** Завершённые тренировки недели week (понедельник «YYYY-MM-DD») в поясе tz. */
export async function countWeekWorkouts(client: Client, userId: string, week: string, tz: string): Promise<number> {
  const [row] = await client.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM "Workout"
    WHERE "userId" = ${userId} AND status = 'COMPLETED'
      AND to_char(date_trunc('week', ("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') = ${week}
  `;
  return row?.n ?? 0;
}

/** Пересчитать серию пользователя по истории тренировок (без заморозок) — миграция и сид. */
export async function recomputeStreak(client: Client, userId: string, now: Date): Promise<void> {
  const user = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true, streakFreezes: true } });
  const tz = safeTimeZone(user.timeZone);
  const rows = await client.$queryRaw<{ week: string; workouts: number }[]>`
    SELECT to_char(date_trunc('week', ("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
           COUNT(*)::int AS workouts
    FROM "Workout"
    WHERE "userId" = ${userId} AND status = 'COMPLETED'
    GROUP BY 1
  `;
  await client.user.update({
    where: { id: userId },
    data: {
      ...streakFromHistory(rows, weekKey(now, tz)),
      streakFreezes: Math.min(user.streakFreezes, MAX_REWARD_FREEZES),
    },
  });
}

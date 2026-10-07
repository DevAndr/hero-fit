import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { nextGoals } from "@/lib/achievements/definitions";
import { getAchievementStats } from "@/lib/achievements/engine";
import { lastDays, type DayPoint } from "@/lib/dashboard/series";
import { dayKey } from "@/lib/daily-login";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Объём по календарным дням (в поясе пользователя) за последние `days` дней. */
async function dailyVolume(userId: string, timeZone: string, days: number): Promise<DayPoint[]> {
  const since = new Date(Date.now() - (days + 1) * DAY_MS);
  const rows = await db.$queryRaw<{ day: string; volume: number; workouts: number }[]>`
    SELECT to_char(("finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}, 'YYYY-MM-DD') AS day,
           SUM("totalVolume")::float8 AS volume,
           COUNT(*)::int AS workouts
    FROM "Workout"
    WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "finishedAt" >= ${since}
    GROUP BY 1
  `;
  return lastDays(rows, dayKey(new Date(), timeZone), days);
}

export async function getDashboard(userId: string, timeZone: string) {
  const now = Date.now();
  const completed = { userId, status: WorkoutStatus.COMPLETED };

  const [volume, total, week, month, weekTime, lastWorkout, activeWorkout, stats, user] = await Promise.all([
    dailyVolume(userId, timeZone, 30),
    db.workout.count({ where: completed }),
    db.workout.count({ where: { ...completed, finishedAt: { gte: new Date(now - 7 * DAY_MS) } } }),
    db.workout.count({ where: { ...completed, finishedAt: { gte: new Date(now - 30 * DAY_MS) } } }),
    db.workout.aggregate({
      where: { ...completed, finishedAt: { gte: new Date(now - 7 * DAY_MS) } },
      _sum: { durationSec: true },
    }),
    db.workout.findFirst({
      where: completed,
      orderBy: { finishedAt: "desc" },
      select: {
        id: true,
        name: true,
        finishedAt: true,
        durationSec: true,
        totalVolume: true,
        totalSets: true,
        xpEarned: true,
        exercises: { orderBy: { order: "asc" }, select: { exercise: { select: { name: true } } } },
      },
    }),
    db.workout.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
      select: { name: true, status: true },
    }),
    getAchievementStats(db, userId),
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastStreakWeek: true,
        streakFreezes: true,
        streakRestoredAt: true,
        weekWorkouts: true,
        weekWorkoutsKey: true,
        freezeGrantedAt: true,
      },
    }),
  ]);

  return {
    volume,
    counts: { total, week, month },
    weekHours: (weekTime._sum.durationSec ?? 0) / 3600,
    lastWorkout,
    activeWorkout,
    nearestGoal: nextGoals(stats)[0] ?? null,
    streak: user,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

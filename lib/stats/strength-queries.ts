import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/daily-login";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { monthCompare, monthRanges, monthWeeks, type MonthCompare, type MonthTotals } from "@/lib/stats/month";
import { strengthTrend, type WeekBest } from "@/lib/stats/strength";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Лучшее по неделям (понедельник в поясе timeZone, по finishedAt) в каждом упражнении с since: рабочие выполненные
 * подходы завершённых тренировок. 1ПМ — Эпли только по подходам с весом и повторами ≤ 12 (на больших формула завышает).
 * exerciseIds — только эти упражнения (прогноз целей).
 */
export async function exerciseWeekBests(
  userId: string,
  timeZone: string,
  since: Date,
  exerciseIds?: string[],
  client: Client = db,
): Promise<WeekBest[]> {
  if (exerciseIds && exerciseIds.length === 0) return [];
  const only = exerciseIds ?? null;
  return client.$queryRaw<WeekBest[]>`
    SELECT we."exerciseId",
           e.name,
           e."isBodyweight" AS bodyweight,
           to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week,
           (MAX(CASE WHEN s.reps = 1 THEN s.weight ELSE s.weight * (1 + s.reps / 30.0) END)
              FILTER (WHERE s.weight > 0 AND s.reps <= 12))::float8 AS "oneRm",
           MAX(s.weight)::float8 AS "maxWeight",
           MAX(s.reps)::int AS "maxReps",
           COUNT(DISTINCT w.id)::int AS sessions
    FROM "WorkoutSet" s
    JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
    JOIN "Workout" w ON w.id = we."workoutId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
      AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s.reps > 0
      AND (${only}::text[] IS NULL OR we."exerciseId" = ANY(${only}::text[]))
    GROUP BY we."exerciseId", e.name, e."isBodyweight", 4
    ORDER BY we."exerciseId", week
  `;
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Тренировки, часы, объём и побитые рекорды за местные дни [from, to]. */
async function monthTotals(userId: string, timeZone: string, from: string, to: string): Promise<MonthTotals> {
  const start = localMidnight(from, timeZone);
  const end = localMidnight(nextDay(to), timeZone);
  const [row] = await db.$queryRaw<MonthTotals[]>`
    SELECT COUNT(*)::int AS workouts,
           (COALESCE(SUM("durationSec"), 0) / 3600.0)::float8 AS hours,
           COALESCE(SUM("totalVolume"), 0)::float8 AS volume,
           (SELECT COALESCE(SUM(jsonb_array_length(meta->'records')), 0) FROM "XpEvent"
             WHERE "userId" = ${userId} AND reason = 'PERSONAL_RECORD' AND jsonb_typeof(meta->'records') = 'array'
               AND "createdAt" >= ${start} AND "createdAt" < ${end})::int AS records
    FROM "Workout"
    WHERE "userId" = ${userId} AND status = 'COMPLETED' AND "finishedAt" >= ${start} AND "finishedAt" < ${end}
  `;
  return row;
}

/** Карточка «Месяц к месяцу» в /stats (и у тренера во вкладке «Статистика»). */
export async function getMonthCompare(userId: string, timeZone: string, now = new Date()): Promise<MonthCompare> {
  const today = dayKey(now, timeZone);
  const r = monthRanges(today);
  const weeks = monthWeeks(today);
  const [cur, prev, bests] = await Promise.all([
    monthTotals(userId, timeZone, r.cur.from, r.cur.to),
    monthTotals(userId, timeZone, r.prev.from, r.prev.to),
    exerciseWeekBests(userId, timeZone, localMidnight(weeks.before[0], timeZone)),
  ]);
  return monthCompare(cur, prev, strengthTrend(bests, weeks), today);
}

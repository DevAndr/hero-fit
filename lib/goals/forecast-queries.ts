import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { forecastGoal, forecastShort, forecastText } from "@/lib/goals/forecast";
import type { GoalRow } from "@/lib/goals/rules";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { weekStart } from "@/lib/dates";
import { exerciseWeekBests } from "@/lib/stats/strength-queries";

type Client = Prisma.TransactionClient | typeof db;

export type GoalForecastView = { text: string; short: string };

const FORECAST_WEEKS = 8;
const METRIC_FIELD = { ONE_RM: "oneRm", MAX_WEIGHT: "maxWeight", MAX_REPS: "maxReps" } as const;

/**
 * Прогноз активных силовых целей и цели по весу тела по динамике за 8 недель (готовые тексты);
 * остальным целям и при малом числе точек — нет записи (показывается paceStatus).
 */
export async function getGoalForecasts(
  client: Client,
  userId: string,
  goals: (GoalRow & { current: number })[],
  tz: string,
  now = new Date(),
): Promise<Map<string, GoalForecastView>> {
  const out = new Map<string, GoalForecastView>();
  const strength = goals.filter((g) => g.type === "STRENGTH" && g.exerciseId && g.metric);
  const weightGoals = goals.filter((g) => g.type === "BODY_WEIGHT");
  const holdGoals = goals.filter((g) => g.type === "STRETCH_HOLD" && g.exerciseId);
  if (!strength.length && !weightGoals.length && !holdGoals.length) return out;
  if (!(await isEnabled("strength_analytics", userId))) return out; // флаг владельца целей

  const today = dayKey(now, tz);
  const firstWeek = new Date(Date.parse(`${weekStart(today)}T12:00:00Z`) - (FORECAST_WEEKS - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  const [bests, weights] = await Promise.all([
    exerciseWeekBests(userId, tz, localMidnight(firstWeek, tz), [...new Set(strength.map((g) => g.exerciseId!))], client),
    weightGoals.length
      ? client.bodyWeightEntry.findMany({ where: { userId, date: { gte: firstWeek } }, orderBy: { date: "asc" }, select: { date: true, weight: true } })
      : [],
  ]);

  for (const g of strength) {
    const field = METRIC_FIELD[g.metric as keyof typeof METRIC_FIELD];
    const points = bests
      .filter((b) => b.exerciseId === g.exerciseId)
      .flatMap((b) => {
        const value = b[field];
        return value ? [{ week: b.week, value }] : [];
      });
    const f = forecastGoal({ points, current: g.current, target: g.target, deadline: g.deadline, today });
    if (f) out.set(g.id, { text: forecastText(f, { unit: g.metric === "MAX_REPS" ? "повт." : "кг", bodyWeight: false, today }), short: forecastShort(f, today) });
  }
  if (holdGoals.length) {
    // Рекорд удержания по неделям — самый долгий подход растяжки
    const ids = [...new Set(holdGoals.map((g) => g.exerciseId!))];
    const bests = await client.$queryRaw<{ exerciseId: string; week: string; value: number }[]>`
      SELECT we."exerciseId",
             to_char(date_trunc('week', (w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
             MAX(s."durationSec")::int AS value
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${localMidnight(firstWeek, tz)}
        AND s."isWarmup" = false AND s."completedAt" IS NOT NULL AND s."durationSec" > 0
        AND we."exerciseId" = ANY(${ids}::text[])
      GROUP BY we."exerciseId", 2
      ORDER BY 2`;
    for (const g of holdGoals) {
      const points = bests.filter((b) => b.exerciseId === g.exerciseId).map((b) => ({ week: b.week, value: b.value }));
      const f = forecastGoal({ points, current: g.current, target: g.target, deadline: g.deadline, today });
      if (f) out.set(g.id, { text: forecastText(f, { unit: "с", bodyWeight: false, today }), short: forecastShort(f, today) });
    }
  }
  if (weightGoals.length) {
    // Последняя запись недели
    const byWeek = new Map<string, number>();
    for (const w of weights) byWeek.set(weekStart(w.date), w.weight);
    const points = [...byWeek].map(([week, value]) => ({ week, value }));
    for (const g of weightGoals) {
      const f = forecastGoal({ points, current: g.current, target: g.target, deadline: g.deadline, today });
      if (f) out.set(g.id, { text: forecastText(f, { unit: "кг", bodyWeight: true, today }), short: forecastShort(f, today) });
    }
  }
  return out;
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dayKey } from "@/lib/daily-login";
import {
  deadlineEnd,
  goalProgress,
  goalTitle,
  paceStatus,
  suggestGoals,
  type GoalInput,
  type GoalRow,
  type GoalSuggestion,
} from "@/lib/goals/rules";

type Client = Prisma.TransactionClient | typeof db;

export type GoalView = GoalRow & {
  title: string;
  exerciseName: string | null;
  current: number;
  progress: number;
  pace: "ahead" | "behind" | null;
  closedAt: Date | null;
};

const goalSelect = {
  id: true,
  type: true,
  exerciseId: true,
  metric: true,
  target: true,
  startValue: true,
  deadline: true,
  status: true,
  createdAt: true,
  achievedAt: true,
  closedAt: true,
  chestOpenedAt: true,
  exercise: { select: { name: true } },
} satisfies Prisma.GoalSelect;

/** Текущее значение каждой цели (по id) — из рекордов, тренировок, серии и взвешиваний. */
export async function getCurrentValues(client: Client, userId: string, goals: GoalRow[], tz: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (goals.length === 0) return out;

  const strength = goals.filter((g) => g.type === "STRENGTH" && g.exerciseId && g.metric);
  const records = strength.length
    ? await client.personalRecord.findMany({
        where: { userId, OR: strength.map((g) => ({ exerciseId: g.exerciseId!, type: g.metric! })) },
        select: { exerciseId: true, type: true, value: true },
      })
    : [];
  const needUser = goals.some((g) => g.type === "STREAK");
  const user = needUser ? await client.user.findUniqueOrThrow({ where: { id: userId }, select: { currentStreak: true } }) : null;
  const needWeight = goals.some((g) => g.type === "BODY_WEIGHT");
  const weight = needWeight ? await latestWeight(client, userId) : null;

  for (const g of goals) {
    switch (g.type) {
      case "STRENGTH":
        out.set(g.id, records.find((r) => r.exerciseId === g.exerciseId && r.type === g.metric)?.value ?? 0);
        break;
      case "STREAK":
        out.set(g.id, user!.currentStreak);
        break;
      case "BODY_WEIGHT":
        out.set(g.id, weight ?? g.startValue);
        break;
      case "WORKOUTS":
      case "HOURS": {
        const agg = await client.workout.aggregate({
          where: {
            userId,
            status: WorkoutStatus.COMPLETED,
            finishedAt: { gte: g.createdAt, ...(g.deadline ? { lt: deadlineEnd(g.deadline, tz) } : {}) },
          },
          _count: { _all: true },
          _sum: { durationSec: true },
        });
        out.set(g.id, g.type === "WORKOUTS" ? agg._count._all : Math.round(((agg._sum.durationSec ?? 0) / 3600) * 10) / 10);
        break;
      }
    }
  }
  return out;
}

export async function latestWeight(client: Client, userId: string): Promise<number | null> {
  const row = await client.bodyWeightEntry.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { weight: true } });
  return row?.weight ?? null;
}

/** Текущее значение того, что улучшает новая цель (счётчики — «с момента постановки», т. е. 0). */
export async function currentValueFor(client: Client, userId: string, input: Pick<GoalInput, "type" | "exerciseId" | "metric">): Promise<number | null> {
  switch (input.type) {
    case "STRENGTH": {
      const pr = await client.personalRecord.findUnique({
        where: { userId_exerciseId_type: { userId, exerciseId: input.exerciseId!, type: input.metric! } },
        select: { value: true },
      });
      return pr?.value ?? 0;
    }
    case "STREAK":
      return (await client.user.findUniqueOrThrow({ where: { id: userId }, select: { currentStreak: true } })).currentStreak;
    case "BODY_WEIGHT":
      return latestWeight(client, userId);
    default:
      return 0;
  }
}

type GoalWithExercise = Prisma.GoalGetPayload<{ select: typeof goalSelect }>;

function toRow(g: GoalWithExercise): GoalRow & { closedAt: Date | null; exerciseName: string | null } {
  const { exercise, ...rest } = g;
  return { ...rest, exerciseName: exercise?.name ?? null };
}

async function toViews(client: Client, userId: string, goals: GoalWithExercise[], tz: string, now = new Date()): Promise<GoalView[]> {
  const rows = goals.map(toRow);
  const active = rows.filter((g) => g.status === GoalStatus.ACTIVE);
  const values = await getCurrentValues(client, userId, active, tz);
  return rows.map((g) => {
    const closed = g.status !== GoalStatus.ACTIVE;
    const current = values.get(g.id) ?? (g.status === GoalStatus.ACHIEVED ? g.target : g.startValue);
    const progress = g.status === GoalStatus.ACHIEVED ? 1 : goalProgress(g, current);
    return {
      ...g,
      title: goalTitle(g),
      current,
      progress,
      pace: closed ? null : paceStatus(g, progress, now, tz),
    };
  });
}

/** «Пройдено» у проваленных — по данным до конца срока (рекорд мог вырасти позже — не больше 99 %). */
async function failedProgress(userId: string, goals: GoalView[], tz: string) {
  const failed = goals.filter((g) => g.status === GoalStatus.FAILED);
  if (failed.length === 0) return goals;
  const values = await getCurrentValues(db, userId, failed, tz);
  return goals.map((g) => {
    if (g.status !== GoalStatus.FAILED) return g;
    const current = values.get(g.id) ?? g.startValue;
    return { ...g, current, progress: Math.min(goalProgress(g, current), 0.99) };
  });
}

export async function getGoalsPage(userId: string, tz: string) {
  const goals = await db.goal.findMany({
    where: { userId },
    select: goalSelect,
    orderBy: { createdAt: "asc" },
  });
  const views = await failedProgress(userId, await toViews(db, userId, goals, tz), tz);
  const unopened = views.filter((g) => g.status === GoalStatus.ACHIEVED && !g.chestOpenedAt);
  const active = [...unopened, ...views.filter((g) => g.status === GoalStatus.ACTIVE)];
  const history = views
    .filter((g) => g.status === GoalStatus.FAILED || (g.status === GoalStatus.ACHIEVED && g.chestOpenedAt))
    .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
    .slice(0, 20);

  const [weights, suggestions] = await Promise.all([getWeightHistory(userId, tz), getSuggestions(userId, tz, views)]);
  return { active, history, weights, suggestions };
}

export async function getWeightHistory(userId: string, tz: string, days = 90) {
  const today = dayKey(new Date(), tz);
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - days);
  return db.bodyWeightEntry.findMany({
    where: { userId, date: { gte: from.toISOString().slice(0, 10) } },
    orderBy: { date: "asc" },
    select: { date: true, weight: true },
  });
}

/** Подсказки — только пока целей нет вовсе. */
async function getSuggestions(userId: string, tz: string, goals: GoalView[]): Promise<GoalSuggestion[]> {
  if (goals.length > 0) return [];
  const since = new Date(Date.now() - 90 * 86_400_000);
  const [top] = await db.$queryRaw<{ id: string; name: string; work: number }[]>`
    SELECT e.id, e.name, MAX(s.weight) AS work
    FROM "WorkoutExercise" we
    JOIN "Workout" w ON w.id = we."workoutId"
    JOIN "Exercise" e ON e.id = we."exerciseId"
    JOIN "WorkoutSet" s ON s."workoutExerciseId" = we.id
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
      AND NOT e."isBodyweight" AND NOT s."isWarmup" AND s."completedAt" IS NOT NULL AND s.weight > 0
    GROUP BY e.id, e.name
    ORDER BY COUNT(DISTINCT w.id) DESC, MAX(s.weight) DESC
    LIMIT 1`;
  const { currentStreak } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { currentStreak: true } });
  return suggestGoals(
    { topExercise: top ? { id: top.id, name: top.name, workWeight: Number(top.work) } : null, streak: currentStreak },
    dayKey(new Date(), tz),
  );
}

/** Дашборд: неоткрытые сундуки целей, затем до 2 активных с наибольшим прогрессом. */
export async function getDashboardGoals(userId: string, tz: string): Promise<{ goals: GoalView[]; total: number }> {
  const goals = await db.goal.findMany({
    where: { userId, OR: [{ status: GoalStatus.ACTIVE }, { status: GoalStatus.ACHIEVED, chestOpenedAt: null }] },
    select: goalSelect,
  });
  const views = await toViews(db, userId, goals, tz);
  const unopened = views.filter((g) => g.status === GoalStatus.ACHIEVED);
  const active = views.filter((g) => g.status === GoalStatus.ACTIVE).sort((a, b) => b.progress - a.progress);
  return { goals: [...unopened, ...active.slice(0, 2)], total: views.length };
}

/** Тренер: активные цели клиента и последние 5 выполненных. */
export async function getClientGoals(clientId: string, tz: string) {
  const [active, achieved] = await Promise.all([
    db.goal.findMany({ where: { userId: clientId, status: GoalStatus.ACTIVE }, select: goalSelect, orderBy: { createdAt: "asc" } }),
    db.goal.findMany({ where: { userId: clientId, status: GoalStatus.ACHIEVED }, select: goalSelect, orderBy: { closedAt: "desc" }, take: 5 }),
  ]);
  return { active: await toViews(db, clientId, active, tz), achieved: await toViews(db, clientId, achieved, tz) };
}

/** Активная силовая цель по упражнению — для линии цели на графике. */
export async function getExerciseGoal(userId: string, exerciseId: string) {
  const g = await db.goal.findFirst({
    where: { userId, exerciseId, type: "STRENGTH", status: GoalStatus.ACTIVE },
    orderBy: { createdAt: "asc" },
    select: { metric: true, target: true },
  });
  return g?.metric ? { metric: g.metric, target: g.target } : null;
}

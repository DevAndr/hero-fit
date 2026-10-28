import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { getGoalForecasts, type GoalForecastView } from "@/lib/goals/forecast-queries";
import { dayKey } from "@/lib/daily-login";
import { streakStatus, streakValue } from "@/lib/progress/weekly-streak";
import {
  deadlineEnd,
  goalProgress,
  goalRecordType,
  goalTitle,
  isStrengthMetric,
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
  /** Прогноз по динамике (силовые и вес тела, от 3 недель данных); null — показывается pace. */
  forecast: GoalForecastView | null;
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

  // Рекордные цели: сила (метрика) и удержание растяжки (MAX_DURATION)
  const strength = goals.filter((g) => g.exerciseId && goalRecordType(g));
  const records = strength.length
    ? await client.personalRecord.findMany({
        where: { userId, OR: strength.map((g) => ({ exerciseId: g.exerciseId!, type: goalRecordType(g)! })) },
        select: { exerciseId: true, type: true, value: true },
      })
    : [];
  const streak = goals.some((g) => g.type === "STREAK") ? await effectiveStreak(client, userId, tz) : 0;
  const needWeight = goals.some((g) => g.type === "BODY_WEIGHT");
  const weight = needWeight ? await latestWeight(client, userId) : null;

  for (const g of goals) {
    switch (g.type) {
      case "STRENGTH":
      case "STRETCH_HOLD":
        out.set(g.id, records.find((r) => r.exerciseId === g.exerciseId && r.type === goalRecordType(g))?.value ?? 0);
        break;
      case "STREAK":
        out.set(g.id, streak);
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
            stretchOnly: false, // сессии растяжки — не тренировки и не часы в зале
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

/** Серия, как её видит пользователь: сгоревшая — 0 (User.currentStreak хранит прежнее число до новой недели). */
export async function effectiveStreak(client: Client, userId: string, tz: string, now = new Date()): Promise<number> {
  const user = await client.user.findUniqueOrThrow({
    where: { id: userId },
    select: { currentStreak: true, lastStreakWeek: true, streakFreezes: true, weekWorkouts: true, weekWorkoutsKey: true, freezeGrantedAt: true },
  });
  return streakValue(streakStatus(user, now, tz));
}

export async function latestWeight(client: Client, userId: string): Promise<number | null> {
  const row = await client.bodyWeightEntry.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { weight: true } });
  return row?.weight ?? null;
}

/** Текущее значение того, что улучшает новая цель (счётчики — «с момента постановки», т. е. 0). */
export async function currentValueFor(
  client: Client,
  userId: string,
  input: Pick<GoalInput, "type" | "exerciseId" | "metric">,
  tz: string,
): Promise<number | null> {
  switch (input.type) {
    case "STRENGTH": {
      const pr = await client.personalRecord.findUnique({
        where: { userId_exerciseId_type: { userId, exerciseId: input.exerciseId!, type: input.metric! } },
        select: { value: true },
      });
      return pr?.value ?? 0;
    }
    case "STRETCH_HOLD": {
      const pr = await client.personalRecord.findUnique({
        where: { userId_exerciseId_type: { userId, exerciseId: input.exerciseId!, type: "MAX_DURATION" } },
        select: { value: true },
      });
      return pr?.value ?? 0;
    }
    case "STREAK":
      return effectiveStreak(client, userId, tz);
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
  const forecasts = await getGoalForecasts(
    client,
    userId,
    active.map((g) => ({ ...g, current: values.get(g.id) ?? g.startValue })),
    tz,
    now,
  );
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
      forecast: closed ? null : (forecasts.get(g.id) ?? null),
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
  const streak = await effectiveStreak(db, userId, tz);
  return suggestGoals(
    { topExercise: top ? { id: top.id, name: top.name, workWeight: Number(top.work) } : null, streak },
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

/** Активная силовая цель по упражнению — для линии цели и строки прогноза на графике. */
export async function getExerciseGoal(userId: string, exerciseId: string, tz: string) {
  const g = await db.goal.findFirst({
    where: { userId, exerciseId, type: "STRENGTH", status: GoalStatus.ACTIVE },
    orderBy: { createdAt: "asc" },
    select: goalSelect,
  });
  if (!g || !isStrengthMetric(g.metric)) return null;
  const [view] = await toViews(db, userId, [g], tz);
  return { metric: g.metric, target: g.target, forecast: view.forecast?.text ?? null };
}

export type GoalFormExercise = { id: string; name: string; isBodyweight: boolean; records: Partial<Record<"ONE_RM" | "MAX_WEIGHT" | "MAX_REPS" | "MAX_DURATION", number>> };
export type GoalFormData = {
  exercises: GoalFormExercise[];
  /** Упражнения растяжки для цели «Удержание»; пусто и `stretch: false`, пока флаг `stretching` выключен. */
  stretchExercises: GoalFormExercise[];
  stretch: boolean;
  streak: number;
  weight: number | null;
  today: string;
};

/** Диалог «Новая цель»: упражнения с текущими рекордами («сейчас: …»), серия, последний вес. */
export async function getGoalFormData(userId: string, tz: string): Promise<GoalFormData> {
  const stretch = await isEnabled("stretching", userId);
  const [exercises, stretchExercises, records, streak, weight] = await Promise.all([
    db.exercise.findMany({
      // Силовые цели — только упражнения с повторами
      where: { archivedAt: null, kind: "REPS", OR: [{ userId: null }, { userId }] },
      select: { id: true, name: true, isBodyweight: true },
      orderBy: { name: "asc" },
    }),
    stretch
      ? db.exercise.findMany({
          where: { archivedAt: null, kind: "STRETCH", OR: [{ userId: null }, { userId }] },
          select: { id: true, name: true, isBodyweight: true },
          orderBy: { name: "asc" },
        })
      : [],
    db.personalRecord.findMany({ where: { userId }, select: { exerciseId: true, type: true, value: true } }),
    effectiveStreak(db, userId, tz),
    latestWeight(db, userId),
  ]);
  const byExercise = new Map<string, GoalFormExercise["records"]>();
  for (const r of records) byExercise.set(r.exerciseId, { ...byExercise.get(r.exerciseId), [r.type]: r.value });
  return {
    exercises: exercises.map((e) => ({ ...e, records: byExercise.get(e.id) ?? {} })),
    stretchExercises: stretchExercises.map((e) => ({ ...e, records: byExercise.get(e.id) ?? {} })),
    stretch,
    streak,
    weight,
    today: dayKey(new Date(), tz),
  };
}

/** Активные цели растяжки (страница /stretching) — показываются независимо от флага постановки. */
export async function getStretchGoals(userId: string, tz: string): Promise<GoalView[]> {
  const goals = await db.goal.findMany({
    where: { userId, status: GoalStatus.ACTIVE, type: { in: ["STRETCH_WEEKLY", "STRETCH_HOLD", "STRETCH_SKILL"] } },
    select: goalSelect,
    orderBy: { createdAt: "asc" },
  });
  return toViews(db, userId, goals, tz);
}

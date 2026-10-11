import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus } from "@/generated/prisma/enums";
import { safeTimeZone } from "@/lib/daily-login";
import { getCurrentValues } from "@/lib/goals/queries";
import { markAchieved } from "@/lib/goals/mutations";
import { deadlineEnd, goalProgress, goalTitle, isAchieved, type FinishGoals, type GoalRow } from "@/lib/goals/rules";

type Client = Prisma.TransactionClient;

type GoalSnapshot = {
  tz: string;
  goals: (GoalRow & { exerciseName: string | null })[];
  before: Map<string, number>;
};

/** Активные цели (кроме веса тела) и их значения до тренировки — снимать до записи тренировки и рекордов. */
export async function snapshotGoals(tx: Client, userId: string): Promise<GoalSnapshot> {
  const { timeZone } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { timeZone: true } });
  const tz = safeTimeZone(timeZone);
  const rows = await tx.goal.findMany({
    where: { userId, status: GoalStatus.ACTIVE, type: { not: "BODY_WEIGHT" } },
    include: { exercise: { select: { name: true } } },
  });
  const goals = rows.map(({ exercise, ...g }) => ({ ...g, exerciseName: exercise?.name ?? null }));
  return { tz, goals, before: await getCurrentValues(tx, userId, goals, tz) };
}

/**
 * Цели после тренировки (в транзакции finishWorkout, после рекордов и серии): выполненные — ACHIEVED без
 * уведомления (человек видит сводку), продвинутые — для строк прироста. Срок сравнивается с finishedAt тренировки.
 */
export async function applyGoals(tx: Client, userId: string, finishedAt: Date, snap: GoalSnapshot): Promise<FinishGoals | undefined> {
  const eligible = snap.goals.filter((g) => !g.deadline || finishedAt < deadlineEnd(g.deadline, snap.tz));
  if (eligible.length === 0) return undefined;
  const after = await getCurrentValues(tx, userId, eligible, snap.tz);
  const result: FinishGoals = { achieved: [], advanced: [] };
  for (const g of eligible) {
    const title = goalTitle(g);
    const now = after.get(g.id) ?? 0;
    if (isAchieved(g, now)) {
      if (await markAchieved(tx, userId, { id: g.id, title }, finishedAt, false)) {
        const kg = g.type === "STRENGTH" && g.metric !== "MAX_REPS";
        result.achieved.push({ id: g.id, type: g.type, title, feedTitle: kg ? g.exerciseName : null });
      }
      continue;
    }
    const before = goalProgress(g, snap.before.get(g.id) ?? 0);
    const progress = goalProgress(g, now);
    if (progress > before) result.advanced.push({ id: g.id, title, before, after: progress });
  }
  return result.achieved.length || result.advanced.length ? result : undefined;
}

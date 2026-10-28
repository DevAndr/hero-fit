import "server-only";
import { GoalStatus, NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { getCurrentValues, stretchWeekSums } from "@/lib/goals/queries";
import { goalStretchWeeks, weeklyStatus, weeklyValue } from "@/lib/goals/stretch-weekly";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { markAchieved } from "@/lib/goals/mutations";
import { goalNotice, goalProgress, goalTitle } from "@/lib/goals/rules";
import { goalDue, goalTickAction, weeklyTickAction } from "@/lib/goals/tick-rules";
import { notify } from "@/lib/notifications/service";

const BUDGET_MS = 1_000;

function utcDay(now: Date, days: number) {
  return dayKey(new Date(now.getTime() + days * 86_400_000), "UTC");
}

/**
 * Сроки целей: напоминание за 7 дней (один раз — `reminderAt`), провал после конца срока + фора 24 ч
 * (финиш офлайн-тренировки принимается до 24 ч назад). Выборка — грубо по датам (пояса ±14 ч), точно — `goalDue`.
 * Регулярность растяжки проваливается и до срока — после недели без нормы (`weeklyTickAction`), поэтому берётся вся.
 */
export async function processGoals(now: Date): Promise<number> {
  const started = Date.now();
  const candidates = await db.goal.findMany({
    where: {
      status: GoalStatus.ACTIVE,
      deadline: { not: null },
      OR: [{ reminderAt: null, deadline: { lte: utcDay(now, 8) } }, { deadline: { lt: utcDay(now, 0) } }, { type: "STRETCH_WEEKLY" }],
    },
    include: { exercise: { select: { name: true } }, user: { select: { timeZone: true, notifyGoal: true } } },
    orderBy: { deadline: "asc" },
    take: 200,
  });
  let sent = 0;
  for (const { exercise, user, ...goal } of candidates) {
    if (Date.now() - started > BUDGET_MS) break;
    const tz = safeTimeZone(user.timeZone);
    if (!goalDue(goal, now, tz)) continue;
    const weekly = goal.type === "STRETCH_WEEKLY";
    let current: number;
    let action: ReturnType<typeof goalTickAction>;
    if (weekly) {
      // Регулярность: суммы недель (флаг `stretching` не проверяется — поставленная цель живёт и без него)
      const weeks = goalStretchWeeks(goal, tz);
      const sums = weeks.length ? await stretchWeekSums(db, goal.userId, localMidnight(weeks[0].start, tz), tz) : new Map();
      current = weeklyValue(weeklyStatus(weeks, sums, dayKey(now, tz), goal.target, goal.stretchUnit ?? "SESSIONS"));
      action = weeklyTickAction(goal, sums, now, tz);
    } else {
      current = (await getCurrentValues(db, goal.userId, [goal], tz)).get(goal.id) ?? 0;
      action = goalTickAction(goal, current, now, tz);
    }
    if (!action) continue;
    const title = goalTitle({ ...goal, exerciseName: exercise?.name }, tz);
    sent += await db.$transaction(async (tx) => {
      if (action === "achieve") return (await markAchieved(tx, goal.userId, { id: goal.id, title }, now, true)) ? 1 : 0;
      const where = { id: goal.id, status: GoalStatus.ACTIVE, ...(action === "remind" ? { reminderAt: null } : {}) };
      const data = action === "remind" ? { reminderAt: now } : { status: GoalStatus.FAILED, closedAt: now };
      const { count } = await tx.goal.updateMany({ where, data });
      if (count === 0) return 0;
      const progress = Math.min(goalProgress(goal, current), 0.99);
      const kind = action === "remind" ? "reminder" : weekly ? "weekFailed" : "failed";
      const url = action === "remind" ? "/goals" : `/goals?again=${goal.id}`;
      await notify(tx, goal.userId, { type: NotificationType.GOAL, ...goalNotice(kind, title, progress), url }, { push: user.notifyGoal });
      return 1;
    });
  }
  return sent;
}

import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { markAchieved } from "@/lib/goals/mutations";
import { goalOpenAt, goalTitle, isAchieved } from "@/lib/goals/rules";

/**
 * Ядро замера по активной цели «Навык» (внутри транзакции): один замер в местный день, повтор за день заменяет.
 * null — цели нет; true — цель достигнута этим замером (вызывающий делает ачивки и аналитику после транзакции).
 */
export async function writeMeasurement(
  tx: Prisma.TransactionClient,
  user: { id: string; timeZone: string },
  goalId: string,
  cm: number,
  now: Date,
): Promise<boolean | null> {
  const date = dayKey(now, user.timeZone);
  const goal = await tx.goal.findFirst({ where: { id: goalId, userId: user.id, type: "STRETCH_SKILL", status: GoalStatus.ACTIVE } });
  if (!goal) return null;
  await tx.stretchMeasurement.upsert({
    where: { goalId_date: { goalId, date } },
    create: { userId: user.id, goalId, date, cm },
    update: { cm },
  });
  // Срок вышел — замер пишется, но цель уже не закрывается (как у взвешивания)
  if (!isAchieved(goal, cm) || !goalOpenAt(goal, now, user.timeZone)) return false;
  return markAchieved(tx, user.id, { id: goal.id, title: goalTitle(goal) }, now, true);
}

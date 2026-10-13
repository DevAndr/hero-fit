import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { GoalStatus, NotificationType } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { goalNotice } from "@/lib/goals/rules";
import { notify } from "@/lib/notifications/service";

type Client = Prisma.TransactionClient;

/**
 * Перевод цели в ACHIEVED — условный по статусу (два пути не выдадут цель дважды).
 * `notifyUser` — уведомление «Цель достигнута» (не нужно, когда человек и так видит сводку тренировки).
 */
export async function markAchieved(
  tx: Client,
  userId: string,
  goal: { id: string; title: string },
  at: Date,
  notifyUser: boolean,
): Promise<boolean> {
  const { count } = await tx.goal.updateMany({
    where: { id: goal.id, userId, status: GoalStatus.ACTIVE },
    data: { status: GoalStatus.ACHIEVED, achievedAt: at, closedAt: new Date() },
  });
  if (count === 0) return false;
  if (notifyUser) {
    const prefs = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyGoal: true } });
    await notify(tx, userId, { type: NotificationType.GOAL, ...goalNotice("achieved", goal.title, 1), url: "/goals" }, { push: prefs.notifyGoal });
  }
  return true;
}

/** Взвешивание за сегодня (повтор за день перезаписывает); User.bodyWeight — последняя запись. */
export async function writeWeight(tx: Client, userId: string, tz: string, weight: number, now = new Date()) {
  const date = dayKey(now, tz);
  await tx.bodyWeightEntry.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, weight },
    update: { weight },
  });
  return (await syncLatestWeight(tx, userId))!;
}

/** User.bodyWeight — копия последней записи журнала (после записи, правки или удаления). */
export async function syncLatestWeight(tx: Client, userId: string): Promise<number | null> {
  const latest = await tx.bodyWeightEntry.findFirst({ where: { userId }, orderBy: { date: "desc" }, select: { weight: true } });
  if (latest) await tx.user.update({ where: { id: userId }, data: { bodyWeight: latest.weight } });
  return latest?.weight ?? null;
}

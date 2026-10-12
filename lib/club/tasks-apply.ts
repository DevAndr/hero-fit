import "server-only";
import { NotificationType, type Prisma } from "@/generated/prisma/client";
import type { ClubTaskMode } from "@/generated/prisma/enums";
import { eligible, hitCounts, taskDays, taskFeedTitle, taskTitle, unitText, workoutAmount, type WorkoutForTask } from "@/lib/club/tasks";
import { isEnabled } from "@/lib/flags/server";

/** Итог задания клуба по тренировке — для сводки и ленты (`FinishMeta.clubTasks`). */
export type FinishClubTask = {
  taskId: string;
  /** Клуб задания — ссылка из сводки ведёт на его вкладку «Задания». */
  clubId?: string;
  title: string;
  /** Для ленты при скрытых весах (выбирает чтение — приватность применяется при показе): у объёма — без килограммов. */
  feedTitle: string;
  amount: number;
  amountText: string;
  mode: ClubTaskMode;
  /** EACH — личная цель выполнена этой тренировкой; CLUB — задание выполнено этой тренировкой. */
  completed: boolean;
  /** CLUB: этой тренировкой клуб выполнил задание. */
  clubCompleted: boolean;
};

/**
 * Вклад завершённой тренировки в задания клуба игрока (в транзакции `finishWorkout`). Строка задания блокируется:
 * параллельные финиши не дадут двух выполнений и двух пачек сундуков, вклад не потеряется.
 */
export async function applyClubTasks(
  tx: Prisma.TransactionClient,
  a: { userId: string; workoutId: string; finishedAt: Date; now: Date; workout: WorkoutForTask },
): Promise<FinishClubTask[] | undefined> {
  // Флаг игрока: выключенный (kill switch) — вклад не пишется, уведомлений со ссылками на 404 нет
  if (!(await isEnabled("clubs", a.userId))) return undefined;
  const member = await tx.clubMember.findUnique({ where: { userId: a.userId }, select: { clubId: true, joinedAt: true } });
  if (!member) return undefined;
  const tasks = await tx.clubTask.findMany({
    where: { clubId: member.clubId, cancelledAt: null, startsAt: { lte: a.finishedAt }, endsAt: { gt: a.finishedAt } },
    orderBy: { createdAt: "asc" },
    include: { exercise: { select: { name: true } }, club: { select: { name: true } } },
  });

  const results: FinishClubTask[] = [];
  for (const task of tasks) {
    if (!hitCounts({ finishedAt: a.finishedAt, joinedAt: member.joinedAt, startsAt: task.startsAt, endsAt: task.endsAt, now: a.now, cancelledAt: task.cancelledAt })) continue;
    const amount = workoutAmount(task.type, a.workout, task.exerciseId);
    if (amount <= 0) continue;

    await tx.$queryRaw`SELECT id FROM "ClubTask" WHERE id = ${task.id} FOR UPDATE`;
    // Под блокировкой — свежие отметки: отмена или выполнение могли случиться, пока ждали
    const fresh = await tx.clubTask.findUniqueOrThrow({ where: { id: task.id }, select: { cancelledAt: true, completedAt: true } });
    if (fresh.cancelledAt) continue;
    if (await tx.clubTaskHit.findUnique({ where: { taskId_workoutId: { taskId: task.id, workoutId: a.workoutId } }, select: { id: true } })) continue;
    await tx.clubTaskHit.create({ data: { taskId: task.id, userId: a.userId, workoutId: a.workoutId, amount } });

    const title = taskTitle({ ...task, days: taskDays(task) }, task.exercise?.name ?? null);
    const feedTitle = taskFeedTitle({ ...task, days: taskDays(task) }, task.exercise?.name ?? null, true);
    let completed = false;
    let clubCompleted = false;

    if (task.mode === "EACH") {
      const mine = await tx.clubTaskHit.aggregate({ where: { taskId: task.id, userId: a.userId }, _sum: { amount: true } });
      const after = mine._sum.amount ?? 0;
      if (after - amount < task.target && after >= task.target) {
        const created = await tx.clubTaskReward.createMany({ data: [{ taskId: task.id, userId: a.userId }], skipDuplicates: true });
        completed = created.count === 1;
      }
    } else if (!fresh.completedAt) {
      const total = await tx.clubTaskHit.aggregate({ where: { taskId: task.id }, _sum: { amount: true } });
      if ((total._sum.amount ?? 0) >= task.target) {
        const { count } = await tx.clubTask.updateMany({ where: { id: task.id, completedAt: null }, data: { completedAt: a.now } });
        if (count === 1) {
          completed = clubCompleted = true;
          await rewardContributors(tx, task, title);
        }
      }
    }

    results.push({ taskId: task.id, clubId: task.clubId, title, feedTitle, amount, amountText: unitText(task.type, amount), mode: task.mode, completed, clubCompleted });
  }
  return results.length ? results : undefined;
}

/**
 * Выполнение CLUB: сундуки вышедшим на порог (и вышедшим из клуба), уведомления — им с push (по их `notifyAchievements`),
 * остальным участникам без. Пакетными вставками: клуб зала — сотни человек, а это транзакция завершения тренировки.
 */
async function rewardContributors(tx: Prisma.TransactionClient, task: { id: string; clubId: string; target: number; club: { name: string } }, title: string) {
  const sums = await tx.clubTaskHit.groupBy({ by: ["userId"], where: { taskId: task.id }, _sum: { amount: true }, _count: { _all: true } });
  const winners = sums.filter((s) => eligible({ amount: s._sum.amount ?? 0, workouts: s._count._all, target: task.target })).map((s) => s.userId);
  if (winners.length) {
    await tx.clubTaskReward.createMany({ data: winners.map((userId) => ({ taskId: task.id, userId })), skipDuplicates: true });
  }
  const members = await tx.clubMember.findMany({ where: { clubId: task.clubId }, select: { userId: true } });
  const won = new Set(winners);
  const others = members.map((m) => m.userId).filter((id) => !won.has(id));
  const url = `/clubs/${task.clubId}?tab=tasks`;
  const winMessage = { type: NotificationType.SOCIAL, title: `Клуб выполнил задание «${title}» — сундук ждёт`, body: task.club.name, url };
  const otherMessage = { type: NotificationType.SOCIAL, title: `Клуб выполнил задание «${title}»`, body: task.club.name, url };
  await tx.notification.createMany({
    data: [...winners.map((userId) => ({ userId, ...winMessage })), ...others.map((userId) => ({ userId, ...otherMessage }))],
  });
  const pushTo = winners.length
    ? (await tx.user.findMany({ where: { id: { in: winners }, notifyAchievements: true }, select: { id: true } })).map((u) => u.id)
    : [];
  if (pushTo.length) {
    const sendAt = new Date();
    await tx.scheduledPush.createMany({ data: pushTo.map((userId) => ({ userId, ...winMessage, sendAt })) });
  }
}

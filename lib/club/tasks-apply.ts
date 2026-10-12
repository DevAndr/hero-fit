import "server-only";
import { NotificationType, type Prisma } from "@/generated/prisma/client";
import type { ClubTaskMode } from "@/generated/prisma/enums";
import { eligible, hitCounts, taskDays, taskFeedTitle, taskTitle, unitText, workoutAmount, type WorkoutForTask } from "@/lib/club/tasks";
import { notify } from "@/lib/notifications/service";

/** Итог задания клуба по тренировке — для сводки и ленты (`FinishMeta.clubTasks`). */
export type FinishClubTask = {
  taskId: string;
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

    results.push({ taskId: task.id, title, feedTitle, amount, amountText: unitText(task.type, amount), mode: task.mode, completed, clubCompleted });
  }
  return results.length ? results : undefined;
}

/** Выполнение CLUB: сундуки вышедшим на порог (и вышедшим из клуба), уведомления — им с push, остальным участникам без. */
async function rewardContributors(tx: Prisma.TransactionClient, task: { id: string; clubId: string; target: number; club: { name: string } }, title: string) {
  const sums = await tx.clubTaskHit.groupBy({ by: ["userId"], where: { taskId: task.id }, _sum: { amount: true }, _count: { _all: true } });
  const winners = sums.filter((s) => eligible({ amount: s._sum.amount ?? 0, workouts: s._count._all, target: task.target })).map((s) => s.userId);
  if (winners.length) {
    await tx.clubTaskReward.createMany({ data: winners.map((userId) => ({ taskId: task.id, userId })), skipDuplicates: true });
  }
  const members = await tx.clubMember.findMany({
    where: { clubId: task.clubId },
    select: { userId: true, user: { select: { notifyAchievements: true } } },
  });
  const pushFor = new Map(members.map((m) => [m.userId, m.user.notifyAchievements]));
  const recipients = new Set([...winners, ...members.map((m) => m.userId)]);
  const url = `/clubs/${task.clubId}?tab=tasks`;
  for (const userId of recipients) {
    const won = winners.includes(userId);
    await notify(
      tx,
      userId,
      {
        type: NotificationType.SOCIAL,
        title: won ? `Клуб выполнил задание «${title}» — сундук ждёт` : `Клуб выполнил задание «${title}»`,
        body: task.club.name,
        url,
      },
      { push: won && (pushFor.get(userId) ?? true) },
    );
  }
}

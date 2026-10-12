import "server-only";
import type { ClubTaskMode, ClubTaskType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { weekBounds } from "@/lib/social/queries";
import { chestBlock, chestExpired, eligible, taskDays, taskTitle } from "@/lib/club/tasks";

export type TaskChest = { state: "open" | "opened" | "wait" | "expired" };

export type ClubTaskView = {
  id: string;
  title: string;
  mode: ClubTaskMode;
  type: ClubTaskType;
  startsAt: string;
  endsAt: string;
  started: boolean;
  /** Сколько суток осталось (вверх); 0 — окно закрыто. Считает сервер — без расхождения при гидратации. */
  daysLeft: number;
  cancelled: boolean;
  /** CLUB — общий прогресс (всем); EACH — мой (только участнику). */
  progress: { done: number; target: number } | null;
  /** CLUB, участнику: топ-5 вкладчиков с долей %. */
  top: { nickname: string; share: number; me: boolean }[];
  /** CLUB, участнику: мой вклад. */
  mine: { share: number; eligible: boolean; workouts: number } | null;
  /** EACH, участнику: сколько выполнили и кто. */
  completedCount: number | null;
  completedNames: string[] | null;
  completed: boolean;
  chest: TaskChest | null;
};

const TOP = 5;
const ARCHIVE = 10;

/** Открытых мной сундуков заданий за текущую неделю (пн в поясе игрока). */
async function chestsOpenedThisWeek(userId: string, timeZone: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: number }[]>`
    WITH b AS (${weekBounds(timeZone, 0)})
    SELECT COUNT(*)::int AS n FROM "ClubTaskReward" r, b
    WHERE r."userId" = ${userId} AND r."openedAt" IS NOT NULL
      AND (r."openedAt" AT TIME ZONE 'UTC') >= b.start_at AND (r."openedAt" AT TIME ZONE 'UTC') < b.end_at
  `;
  return row?.n ?? 0;
}

/**
 * Задания клуба для вкладки: активные и стартующие, затем архив (до 10). Приватность (согласие «Тренировки — нет»):
 * в EACH чужой прогресс не отдаётся, в CLUB вклад других — только доля; не участнику — только общий прогресс CLUB.
 */
export async function getClubTasks(clubId: string, viewerId: string, member: boolean, timeZone: string, now = new Date()) {
  const tasks = await db.clubTask.findMany({
    where: { clubId },
    orderBy: [{ endsAt: "desc" }],
    include: { exercise: { select: { name: true } } },
    take: 40,
  });
  const live = (t: (typeof tasks)[number]) => !t.cancelledAt && !(t.mode === "CLUB" && t.completedAt) && t.endsAt > now;
  const active = tasks.filter(live).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const archive = tasks.filter((t) => !live(t)).slice(0, ARCHIVE);
  const shown = [...active, ...archive];
  if (!shown.length) return { active: [], archive: [] };

  const ids = shown.map((t) => t.id);
  const [sums, rewards, opened] = await Promise.all([
    db.clubTaskHit.groupBy({ by: ["taskId", "userId"], where: { taskId: { in: ids } }, _sum: { amount: true }, _count: { _all: true } }),
    db.clubTaskReward.findMany({ where: { taskId: { in: ids } }, select: { taskId: true, userId: true, openedAt: true, user: { select: { nickname: true } } } }),
    member ? chestsOpenedThisWeek(viewerId, timeZone) : Promise.resolve(0),
  ]);
  const userIds = [...new Set(sums.map((s) => s.userId))];
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nickname: true } })).map((u) => [u.id, u.nickname ?? "—"]),
  );

  const view = (t: (typeof tasks)[number]): ClubTaskView => {
    const rows = sums.filter((s) => s.taskId === t.id).map((s) => ({ userId: s.userId, amount: s._sum.amount ?? 0, workouts: s._count._all }));
    const total = rows.reduce((sum, r) => sum + r.amount, 0);
    const mineRow = rows.find((r) => r.userId === viewerId);
    const taskRewards = rewards.filter((r) => r.taskId === t.id);
    const myReward = taskRewards.find((r) => r.userId === viewerId);
    const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
    const chest: TaskChest | null = !myReward
      ? null
      : myReward.openedAt
        ? { state: "opened" }
        : chestExpired({ endsAt: t.endsAt, now })
          ? { state: "expired" }
          : chestBlock({ openedThisWeek: opened })
            ? { state: "wait" }
            : { state: "open" };
    return {
      id: t.id,
      title: taskTitle({ ...t, days: taskDays(t) }, t.exercise?.name ?? null),
      mode: t.mode,
      type: t.type,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      started: t.startsAt <= now,
      daysLeft: Math.max(0, Math.ceil((t.endsAt.getTime() - now.getTime()) / 86_400_000)),
      cancelled: Boolean(t.cancelledAt),
      progress: t.mode === "CLUB" ? { done: total, target: t.target } : member ? { done: mineRow?.amount ?? 0, target: t.target } : null,
      top:
        t.mode === "CLUB" && member
          ? [...rows]
              .sort((a, b) => b.amount - a.amount)
              .slice(0, TOP)
              .map((r) => ({ nickname: users.get(r.userId) ?? "—", share: share(r.amount), me: r.userId === viewerId }))
          : [],
      mine:
        t.mode === "CLUB" && member
          ? { share: share(mineRow?.amount ?? 0), workouts: mineRow?.workouts ?? 0, eligible: eligible({ amount: mineRow?.amount ?? 0, workouts: mineRow?.workouts ?? 0, target: t.target }) }
          : null,
      completedCount: t.mode === "EACH" && member ? taskRewards.length : null,
      completedNames: t.mode === "EACH" && member ? taskRewards.map((r) => r.user.nickname ?? "—") : null,
      completed: t.mode === "CLUB" ? Boolean(t.completedAt) : Boolean(myReward),
      // Сундук — и вышедшему из клуба: он его заработал (уведомление «сундук ждёт» ведёт сюда)
      chest,
    };
  };
  const views = { active: active.map(view), archive: archive.map(view) };
  if (member) return views;
  // Не участнику — активные без личных данных и прошедшие, где у него есть сундук (вышел из клуба после вклада)
  const mine = new Set(rewards.filter((r) => r.userId === viewerId).map((r) => r.taskId));
  return { active: views.active, archive: views.archive.filter((t) => mine.has(t.id)) };
}

/** Есть ли активные задания — вкладка «Задания» по умолчанию. */
export async function hasActiveTasks(clubId: string, now = new Date()): Promise<boolean> {
  const n = await db.clubTask.count({
    where: { clubId, cancelledAt: null, endsAt: { gt: now }, OR: [{ mode: "EACH" }, { completedAt: null }] },
  });
  return n > 0;
}

/** Задания для управления: активные и стартующие (с «Отменить»). */
export async function getManageTasks(clubId: string, now = new Date()) {
  const tasks = await db.clubTask.findMany({
    where: { clubId, cancelledAt: null, endsAt: { gt: now }, OR: [{ mode: "EACH" }, { completedAt: null }] },
    orderBy: { startsAt: "asc" },
    include: { exercise: { select: { name: true } } },
  });
  return tasks.map((t) => ({
    id: t.id,
    title: taskTitle({ ...t, days: taskDays(t) }, t.exercise?.name ?? null),
    startsAt: t.startsAt.toISOString(),
    endsAt: t.endsAt.toISOString(),
    started: t.startsAt <= now,
  }));
}

/** Встроенные упражнения для заданий «Повторы». */
export function builtinExercises() {
  return db.exercise.findMany({ where: { userId: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

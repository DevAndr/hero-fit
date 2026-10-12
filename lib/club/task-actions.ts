"use server";

import { revalidatePath } from "next/cache";
import { NotificationType, XpReason } from "@/generated/prisma/enums";
import type { ClubTaskMode, ClubTaskType } from "@/generated/prisma/enums";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { CLUBS_OFF, clubsAllowed } from "@/lib/club/access";
import {
  CLUB_TASK_XP,
  chestBlock,
  chestExpired,
  minTarget,
  startDayAllowed,
  taskBlock,
  taskSchema,
  taskTitle,
  taskWindow,
  TASK_MODES,
  TASK_TYPES,
} from "@/lib/club/tasks";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { levelProgress } from "@/lib/progress/level";
import { weekBounds } from "@/lib/social/queries";

type Result = { ok: true } | { ok: false; error: string };

const NOT_ADMIN = "Это может только админ клуба";

/** Админ клуба с флагом `clubs`. */
type Admin = { ok: false; error: string } | { ok: true; user: Awaited<ReturnType<typeof requireUser>>; club: { id: string; name: string } };

async function clubAdmin(clubId: string): Promise<Admin> {
  const user = await requireUser();
  if (!(await clubsAllowed(user.id))) return { ok: false, error: CLUBS_OFF };
  const club = await db.club.findFirst({ where: { id: String(clubId), adminId: user.id, status: "APPROVED" }, select: { id: true, name: true } });
  if (!club) return { ok: false, error: NOT_ADMIN };
  return { ok: true, user, club };
}

/** Минимум цели для подсказки в форме. */
export async function taskMinimumAction(clubId: string, type: ClubTaskType, mode: ClubTaskMode, days: number): Promise<number | null> {
  const admin = await clubAdmin(clubId);
  if (!admin.ok) return null;
  if (!TASK_TYPES.includes(type) || !TASK_MODES.includes(mode) || !Number.isInteger(days) || days < 7 || days > 31) return null;
  const members = await db.clubMember.count({ where: { clubId: admin.club.id } });
  return minTarget(type, mode, days, members);
}

/** Новое задание: под блокировкой строки клуба — лимит активных не обойти двумя запросами. */
export async function createClubTaskAction(clubId: string, input: unknown): Promise<Result> {
  const admin = await clubAdmin(clubId);
  if (!admin.ok) return { ok: false, error: admin.error };
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const t = parsed.data;
  const tz = safeTimeZone(admin.user.timeZone);
  const now = new Date();
  if (!startDayAllowed(t.startDay, dayKey(now, tz))) return { ok: false, error: "Старт — от сегодня до 14 дней вперёд" };
  const exercise = t.exerciseId ? await db.exercise.findFirst({ where: { id: t.exerciseId, userId: null }, select: { name: true } }) : null;
  if (t.exerciseId && !exercise) return { ok: false, error: "Выберите упражнение из списка" };
  const { startsAt, endsAt } = taskWindow(t.startDay, t.days, tz);

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${admin.club.id} FOR UPDATE`;
    const [members, active] = await Promise.all([
      tx.clubMember.findMany({ where: { clubId: admin.club.id }, select: { userId: true } }),
      tx.clubTask.count({ where: { clubId: admin.club.id, cancelledAt: null, endsAt: { gt: now }, OR: [{ mode: "EACH" }, { completedAt: null }] } }),
    ]);
    const block = taskBlock({ type: t.type, active, target: t.target, min: minTarget(t.type, t.mode, t.days, members.length) });
    if (block) return block;
    await tx.clubTask.create({
      data: {
        clubId: admin.club.id,
        type: t.type,
        mode: t.mode,
        exerciseId: t.exerciseId ?? null,
        target: t.target,
        startsAt,
        endsAt,
        membersAtStart: members.length,
        createdById: admin.user.id,
      },
    });
    const title = taskTitle(t, exercise?.name ?? null);
    // Большой клуб — без push и одной вставкой: уведомление в ленте приложения
    await tx.notification.createMany({
      data: members
        .filter((m) => m.userId !== admin.user.id)
        .map((m) => ({ userId: m.userId, type: NotificationType.SOCIAL, title: `Новое задание клуба: ${title}`, body: admin.club.name, url: `/clubs/${admin.club.id}?tab=tasks` })),
    });
    return null;
  });
  if (result) return { ok: false, error: result };
  revalidatePath(`/clubs/${admin.club.id}`, "layout");
  return { ok: true };
}

/** Отмена: вклад больше не пишется, полученные сундуки остаются. */
export async function cancelClubTaskAction(taskId: string): Promise<Result> {
  const task = await db.clubTask.findUnique({ where: { id: String(taskId) }, select: { clubId: true } });
  if (!task) return { ok: false, error: "Задание не найдено" };
  const admin = await clubAdmin(task.clubId);
  if (!admin.ok) return { ok: false, error: admin.error };
  const { count } = await db.clubTask.updateMany({ where: { id: String(taskId), cancelledAt: null }, data: { cancelledAt: new Date() } });
  if (count === 0) return { ok: false, error: "Задание уже отменено" };
  revalidatePath(`/clubs/${task.clubId}`, "layout");
  return { ok: true };
}

/**
 * Сундук задания: своя награда, не открыта, не истекла, не больше 2 открытых за неделю (пояс игрока).
 * Без revalidatePath — кнопка обновит страницу, когда закрыт диалог (как сундук цели).
 */
export async function openClubTaskChestAction(taskId: string): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await clubsAllowed(user.id))) return { ok: false, error: CLUBS_OFF };
  const tz = safeTimeZone(user.timeZone);
  return db.$transaction(async (tx) => {
    // Строка пользователя — две вкладки не откроют третий сундук недели
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
    const reward = await tx.clubTaskReward.findUnique({
      where: { taskId_userId: { taskId: String(taskId), userId: user.id } },
      select: { id: true, openedAt: true, task: { select: { endsAt: true } } },
    });
    if (!reward) return { ok: false as const, error: "Сундука нет" };
    if (reward.openedAt) return { ok: false as const, error: "Сундук уже открыт" };
    if (chestExpired({ endsAt: reward.task.endsAt, now: new Date() })) return { ok: false as const, error: "Сундук истёк" };
    const [row] = await tx.$queryRaw<{ n: number }[]>`
      WITH b AS (${weekBounds(tz, 0)})
      SELECT COUNT(*)::int AS n FROM "ClubTaskReward" r, b
      WHERE r."userId" = ${user.id} AND r."openedAt" IS NOT NULL
        AND (r."openedAt" AT TIME ZONE 'UTC') >= b.start_at AND (r."openedAt" AT TIME ZONE 'UTC') < b.end_at
    `;
    const block = chestBlock({ openedThisWeek: row?.n ?? 0 });
    if (block) return { ok: false as const, error: block };
    const { count } = await tx.clubTaskReward.updateMany({ where: { id: reward.id, openedAt: null }, data: { openedAt: new Date() } });
    if (count === 0) return { ok: false as const, error: "Сундук уже открыт" };
    await tx.xpEvent.create({ data: { userId: user.id, amount: CLUB_TASK_XP, reason: XpReason.CLUB_TASK_REWARD, meta: { taskId } } });
    const { xp } = await tx.user.update({ where: { id: user.id }, data: { xp: { increment: CLUB_TASK_XP } }, select: { xp: true } });
    await tx.user.update({ where: { id: user.id }, data: { level: levelProgress(xp).level } });
    await evaluateAchievements(tx, user.id);
    return { ok: true as const, amount: CLUB_TASK_XP };
  });
}

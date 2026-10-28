"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { FriendshipStatus, NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { evaluateAchievementsNow } from "@/lib/achievements/engine";
import { quietly } from "@/lib/achievements/quietly";
import { notify } from "@/lib/notifications/service";
import { FINISH_REASONS } from "@/lib/progress/xp";
import { nicknameKey, nicknameSchema, normalizeFriendCode } from "@/lib/social/league";
import { recordExercise, respectNotice } from "@/lib/social/feed";
import { canSeeWorkout, getFeed, getGuildFeed } from "@/lib/social/queries";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const NICK_TAKEN: Result = { ok: false, error: "Этот ник уже занят" };

function revalidate() {
  revalidatePath("/leaderboard");
  revalidatePath("/friends");
  revalidatePath("/settings");
  revalidatePath("/guild");
}

export async function setNicknameAction(input: string): Promise<Result> {
  const user = await requireUser();
  const parsed = nicknameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const nickname = parsed.data;
  const key = nicknameKey(nickname);

  const clash = await db.user.findFirst({ where: { nicknameKey: key, id: { not: user.id } }, select: { id: true } });
  if (clash) return NICK_TAKEN;
  try {
    await db.user.update({ where: { id: user.id }, data: { nickname, nicknameKey: key } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NICK_TAKEN;
    throw e;
  }
  revalidate();
  return { ok: true };
}

/** Заявка в друзья по коду. Встречная заявка от того же человека — сразу дружба. */
export async function sendFriendRequestAction(input: string): Promise<Result> {
  const user = await requireUser();
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
  if (!me.nickname) return { ok: false, error: "Сначала придумайте ник — его увидят друзья" };

  const code = normalizeFriendCode(input);
  const target = code
    ? await db.user.findUnique({ where: { friendCode: code }, select: { id: true, nickname: true, notifySocial: true } })
    : null;
  if (!target) return { ok: false, error: "Код не найден — проверьте его" };
  if (target.id === user.id) return { ok: false, error: "Это ваш собственный код" };
  if (!target.nickname) return { ok: false, error: "У этого атлета ещё нет ника — попросите его зайти в «Рейтинг»" };

  const result = await db.$transaction(async (tx): Promise<Result> => {
    const existing = await tx.friendship.findFirst({
      where: {
        OR: [
          { requesterId: user.id, addresseeId: target.id },
          { requesterId: target.id, addresseeId: user.id },
        ],
      },
    });
    if (existing?.status === FriendshipStatus.ACCEPTED) return { ok: false, error: `${target.nickname} уже в друзьях` };
    if (existing?.requesterId === user.id) return { ok: false, error: "Заявка уже отправлена" };
    if (existing) {
      await tx.friendship.update({
        where: { id: existing.id },
        data: { status: FriendshipStatus.ACCEPTED, acceptedAt: new Date() },
      });
      await notify(
        tx,
        target.id,
        { type: NotificationType.SOCIAL, title: "🤝 Теперь вы друзья", body: `${me.nickname} принял заявку — соревнуйтесь в лиге`, url: "/leaderboard" },
        { push: target.notifySocial },
      );
      return { ok: true, message: `${target.nickname} теперь в друзьях` };
    }
    await tx.friendship.create({ data: { requesterId: user.id, addresseeId: target.id } });
    await notify(
      tx,
      target.id,
      { type: NotificationType.SOCIAL, title: "👋 Заявка в друзья", body: `${me.nickname} хочет соревноваться с вами в недельной лиге`, url: "/leaderboard" },
      { push: target.notifySocial },
    );
    return { ok: true, message: `Заявка отправлена: ${target.nickname}` };
  });

  revalidate();
  return result;
}

export async function respondFriendRequestAction(id: string, accept: boolean): Promise<Result> {
  const user = await requireUser();
  const request = await db.friendship.findFirst({
    where: { id, addresseeId: user.id, status: FriendshipStatus.PENDING },
    select: { requesterId: true, requester: { select: { notifySocial: true } }, addressee: { select: { nickname: true } } },
  });
  if (!request) return { ok: false, error: "Заявка не найдена" };

  if (!accept) {
    await db.friendship.delete({ where: { id } });
  } else {
    await db.$transaction(async (tx) => {
      await tx.friendship.update({ where: { id }, data: { status: FriendshipStatus.ACCEPTED, acceptedAt: new Date() } });
      await notify(
        tx,
        request.requesterId,
        {
          type: NotificationType.SOCIAL,
          title: "🤝 Заявка принята",
          body: `${request.addressee.nickname ?? "Атлет"} теперь в вашей лиге`,
          url: "/leaderboard",
        },
        { push: request.requester.notifySocial },
      );
    });
  }
  revalidate();
  return { ok: true };
}

/** Удалить друга или отменить свою заявку — любая сторона может разорвать связь. */
export async function removeFriendshipAction(id: string): Promise<Result> {
  const user = await requireUser();
  const { count } = await db.friendship.deleteMany({
    where: { id, OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
  });
  revalidate();
  return count ? { ok: true } : { ok: false, error: "Не найдено" };
}

// ───────────────────────────── Лента активности ─────────────────────────────

/** Следующая страница ленты («Показать ещё»). */
export async function loadFeedPageAction(cursor: string, source: "friends" | "guild" = "friends") {
  const user = await requireUser();
  return source === "guild" ? getGuildFeed(user.id, cursor) : getFeed(user.id, cursor);
}

/**
 * 👊 на тренировку друга (повторное нажатие — убрать). Уведомление автору группируется:
 * пока он его не прочитал, обновляем одно и то же («Поддержали: Маша, Борис и ещё 1»); push — только первый раз.
 */
export async function toggleKudosAction(workoutId: string): Promise<Result> {
  const user = await requireUser();
  const workout = await canSeeWorkout(user.id, workoutId);
  if (!workout) return { ok: false, error: "Тренировка недоступна" };
  if (workout.userId === user.id) return { ok: false, error: "Свою тренировку поддержать нельзя" };

  const removed = await db.kudos.deleteMany({ where: { workoutId, userId: user.id } });
  if (removed.count === 0) {
    try {
      await db.kudos.create({ data: { workoutId, userId: user.id } });
    } catch (e) {
      // двойной клик — уже поставлено
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    await notifyKudos(workoutId, workout.userId, workout.friend);
  }
  revalidatePath("/friends");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** `friend` — поставивший видит тренировку как друг; иначе — как согильдиец (ссылка ведёт в ленту гильдии). */
async function notifyKudos(workoutId: string, ownerId: string, friend: boolean) {
  const [workout, givers, owner] = await Promise.all([
    db.workout.findUniqueOrThrow({ where: { id: workoutId }, select: { name: true } }),
    db.kudos.findMany({
      where: { workoutId },
      orderBy: { createdAt: "desc" },
      select: { user: { select: { nickname: true } } },
    }),
    db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { notifySocial: true } }),
  ]);
  const names = givers.map((g) => g.user.nickname ?? "Атлет");
  const body = `Поддержали: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` и ещё ${names.length - 2}` : ""}`;
  const title = `👊 Тренировка «${workout.name}»`;
  const url = `${friend ? "/friends" : "/guild"}#w-${workoutId}`;

  const unread = await db.notification.findFirst({
    where: { userId: ownerId, type: NotificationType.SOCIAL, url, title, readAt: null },
    select: { id: true },
  });
  if (unread) {
    await db.notification.update({ where: { id: unread.id }, data: { title, body, createdAt: new Date() } });
  } else {
    await notify(db, ownerId, { type: NotificationType.SOCIAL, title, body, url }, { push: owner.notifySocial && names.length === 1 });
  }
}

/**
 * 🏆 Респект за рекорд упражнения тренировки друга (повторное нажатие — убрать). Рекорд берётся из сводки завершения:
 * подделанный exerciseId отсекается до записи. Уведомление автору группируется так же, как у 👊.
 */
export async function toggleRespectAction(workoutId: string, exerciseId: string): Promise<Result> {
  const user = await requireUser();
  const workout = await canSeeWorkout(user.id, workoutId);
  if (!workout) return { ok: false, error: "Тренировка недоступна" };
  if (workout.userId === user.id) return { ok: false, error: "Свой рекорд отметить нельзя" };

  const event = await db.xpEvent.findFirst({
    where: { workoutId, reason: { in: [...FINISH_REASONS] } },
    select: { meta: true },
  });
  if (recordExercise(event?.meta, exerciseId) === null) return { ok: false, error: "Рекорд не найден" };

  const removed = await db.recordRespect.deleteMany({ where: { workoutId, exerciseId, userId: user.id } });
  if (removed.count === 0) {
    let created = true;
    try {
      await db.recordRespect.create({ data: { workoutId, exerciseId, userId: user.id } });
    } catch (e) {
      // упражнения уже нет (тренировку или упражнение удалили, пока лента была открыта)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") return { ok: false, error: "Рекорд не найден" };
      // двойной клик или две вкладки — уже поставлено: уведомление не повторяем
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      created = false;
    }
    if (created) {
      await notifyRespect(workoutId, exerciseId, workout.userId, workout.friend);
      await quietly(() => evaluateAchievementsNow(workout.userId), null); // «Заметили» и выше — автору рекорда
    }
  }
  revalidatePath("/friends");
  revalidatePath("/guild");
  return { ok: true };
}

/** Одно уведомление на (тренировка, упражнение): пока непрочитано — обновляем; push — только первый раз. */
async function notifyRespect(workoutId: string, exerciseId: string, ownerId: string, friend: boolean) {
  const [exercise, givers, owner, event] = await Promise.all([
    db.exercise.findUniqueOrThrow({ where: { id: exerciseId }, select: { name: true } }),
    db.recordRespect.findMany({
      where: { workoutId, exerciseId },
      orderBy: { createdAt: "desc" },
      select: { user: { select: { nickname: true } } },
    }),
    db.user.findUniqueOrThrow({ where: { id: ownerId }, select: { notifySocial: true } }),
    db.xpEvent.findFirst({ where: { workoutId, reason: { in: [...FINISH_REASONS] } }, select: { meta: true } }),
  ]);
  const names = givers.map((g) => g.user.nickname ?? "Атлет");
  // Название — из сводки (на момент рекорда), как в ленте; упражнение могли переименовать
  const { title, body } = respectNotice(recordExercise(event?.meta, exerciseId) ?? exercise.name, names);
  const url = `${friend ? "/friends" : "/guild"}#w-${workoutId}`;

  const unread = await db.notification.findFirst({
    where: { userId: ownerId, type: NotificationType.SOCIAL, url, title, readAt: null },
    select: { id: true },
  });
  if (unread) {
    await db.notification.update({ where: { id: unread.id }, data: { title, body, createdAt: new Date() } });
  } else {
    await notify(db, ownerId, { type: NotificationType.SOCIAL, title, body, url }, { push: owner.notifySocial && names.length === 1 });
  }
}

const privacySchema = z.object({ shareActivity: z.boolean(), hideWeights: z.boolean() }).partial();

export async function updatePrivacyAction(patch: z.input<typeof privacySchema>): Promise<Result> {
  const user = await requireUser();
  const parsed = privacySchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Неверные настройки" };
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/settings");
  revalidatePath("/friends");
  return { ok: true };
}

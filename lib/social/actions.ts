"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { FriendshipStatus, NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { notify } from "@/lib/notifications/service";
import { nicknameKey, nicknameSchema, normalizeFriendCode } from "@/lib/social/league";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const NICK_TAKEN: Result = { ok: false, error: "Этот ник уже занят" };

function revalidate() {
  revalidatePath("/leaderboard");
  revalidatePath("/settings");
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

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { guildKey, guildNameSchema, isEmblem, joinBlock, leaveBlock } from "@/lib/guild/rules";
import { notify } from "@/lib/notifications/service";
import { generateFriendCode, normalizeFriendCode } from "@/lib/social/league";

type Result = { ok: true } | { ok: false; error: string };
type Tx = Prisma.TransactionClient;

const TAKEN = "Такая гильдия уже есть";
const NOT_LEADER = "Это может только глава гильдии";
const guildSchema = z.object({ name: guildNameSchema, emblem: z.string().refine(isEmblem, "Выберите значок") });

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Новый код приглашения; совпадение с чужим — следующая попытка. */
async function freshCode(tx: Tx | typeof db) {
  for (let i = 0; i < 5; i++) {
    const code = generateFriendCode();
    if (!(await tx.guild.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Не удалось создать код гильдии");
}

/** Выйти из гильдии внутри транзакции: последний — удалить гильдию. */
async function leave(tx: Tx, userId: string, guildId: string) {
  await tx.guildMember.delete({ where: { userId } });
  if (!(await tx.guildMember.count({ where: { guildId } }))) await tx.guild.delete({ where: { id: guildId } });
}

/** Моё членство и глава ли я (для действий главы). */
async function myMembership(userId: string) {
  return db.guildMember.findUnique({
    where: { userId },
    select: { guildId: true, guild: { select: { leaderId: true, name: true, _count: { select: { members: true } } } } },
  });
}

export async function createGuildAction(input: { name: string; emblem: string }): Promise<Result> {
  const user = await requireUser();
  const parsed = guildSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true, guildMember: { select: { userId: true } } } });
  if (!me.nickname) return { ok: false, error: "Нужен ник" };
  if (me.guildMember) return { ok: false, error: "Вы уже в гильдии" };
  const { name, emblem } = parsed.data;
  try {
    await db.$transaction(async (tx) => {
      const guild = await tx.guild.create({
        data: { name, nameKey: guildKey(name), emblem, code: await freshCode(tx), leaderId: user.id },
        select: { id: true },
      });
      await tx.guildMember.create({ data: { userId: user.id, guildId: guild.id } });
    });
  } catch (e) {
    if (!isUnique(e)) throw e;
    // Двойное «Создать» (уже участник) или название занято
    const member = await db.guildMember.findUnique({ where: { userId: user.id }, select: { userId: true } });
    return { ok: false, error: member ? "Вы уже в гильдии" : TAKEN };
  }
  revalidatePath("/guild");
  revalidatePath("/dashboard");
  return { ok: true };
}

const JOIN_ERRORS = { full: "В гильдии нет мест", leader: "Сначала передайте главенство в своей гильдии" } as const;

/** Вступить по коду: сразу, без заявки; прежняя гильдия покидается. Строка гильдии блокируется — двое не займут одно место. */
export async function joinGuildAction(input: string): Promise<Result> {
  const user = await requireUser();
  const code = normalizeFriendCode(String(input ?? ""));
  if (!code) return { ok: false, error: "Гильдия не найдена" };
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
  if (!me.nickname) return { ok: false, error: "Нужен ник" };

  const result = await db.$transaction(async (tx) => {
    // Запросы по очереди: у транзакции одно соединение
    const [locked] = await tx.$queryRaw<{ id: string; name: string; leaderId: string }[]>`
      SELECT id, name, "leaderId" FROM "Guild" WHERE code = ${code} FOR UPDATE
    `;
    if (!locked) return "Гильдия не найдена";
    const members = await tx.guildMember.count({ where: { guildId: locked.id } });
    const current = await tx.guildMember.findUnique({
      where: { userId: user.id },
      select: { guildId: true, guild: { select: { leaderId: true, _count: { select: { members: true } } } } },
    });
    const block = joinBlock({
      members,
      inThis: current?.guildId === locked.id,
      current: current ? { isLeader: current.guild.leaderId === user.id, members: current.guild._count.members } : null,
    });
    if (block === "same") return null;
    if (block) return JOIN_ERRORS[block];
    if (current) await leave(tx, user.id, current.guildId);
    await tx.guildMember.create({ data: { userId: user.id, guildId: locked.id } });
    await notify(
      tx,
      locked.leaderId,
      { type: NotificationType.SOCIAL, title: `${me.nickname} вступил(а) в гильдию`, body: locked.name, url: "/guild" },
      { push: true },
    );
    return null;
  });
  if (result) return { ok: false, error: result };
  revalidatePath("/guild");
  revalidatePath("/dashboard");
  redirect("/guild");
}

export async function leaveGuildAction(): Promise<Result> {
  const user = await requireUser();
  const membership = await myMembership(user.id);
  if (!membership) return { ok: false, error: "Вы не в гильдии" };
  const block = leaveBlock(membership.guild.leaderId === user.id, membership.guild._count.members);
  if (block) return { ok: false, error: block };
  await db.$transaction((tx) => leave(tx, user.id, membership.guildId));
  revalidatePath("/guild");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Действие главы над участником своей гильдии (не над собой). */
async function leaderOver(memberId: string) {
  const user = await requireUser();
  const membership = await myMembership(user.id);
  if (!membership || membership.guild.leaderId !== user.id) return { ok: false as const, error: NOT_LEADER };
  if (memberId === user.id) return { ok: false as const, error: "Нельзя выбрать себя" };
  const target = await db.guildMember.findUnique({ where: { userId: String(memberId) }, select: { guildId: true } });
  if (target?.guildId !== membership.guildId) return { ok: false as const, error: "Участник не найден" };
  return { ok: true as const, user, membership };
}

export async function kickMemberAction(memberId: string): Promise<Result> {
  const ctx = await leaderOver(memberId);
  if (!ctx.ok) return ctx;
  await db.$transaction(async (tx) => {
    await tx.guildMember.delete({ where: { userId: memberId } });
    await notify(
      tx,
      memberId,
      { type: NotificationType.SOCIAL, title: `Вас исключили из гильдии «${ctx.membership.guild.name}»`, body: "Можно создать свою или вступить по ссылке", url: "/guild" },
      { push: true },
    );
  });
  revalidatePath("/guild");
  return { ok: true };
}

export async function transferLeadAction(memberId: string): Promise<Result> {
  const ctx = await leaderOver(memberId);
  if (!ctx.ok) return ctx;
  await db.$transaction(async (tx) => {
    // Условие на прежнего главу — двойной клик или две вкладки не передадут дважды
    const { count } = await tx.guild.updateMany({ where: { id: ctx.membership.guildId, leaderId: ctx.user.id }, data: { leaderId: memberId } });
    if (!count) return;
    await notify(
      tx,
      memberId,
      { type: NotificationType.SOCIAL, title: `Вы теперь глава гильдии «${ctx.membership.guild.name}»`, body: "Приглашайте, исключайте, меняйте ссылку", url: "/guild" },
      { push: true },
    );
  });
  revalidatePath("/guild");
  return { ok: true };
}

export async function updateGuildAction(input: { name: string; emblem: string }): Promise<Result> {
  const user = await requireUser();
  const parsed = guildSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { name, emblem } = parsed.data;
  try {
    const { count } = await db.guild.updateMany({ where: { leaderId: user.id, members: { some: { userId: user.id } } }, data: { name, nameKey: guildKey(name), emblem } });
    if (!count) return { ok: false, error: NOT_LEADER };
  } catch (e) {
    if (isUnique(e)) return { ok: false, error: TAKEN };
    throw e;
  }
  revalidatePath("/guild");
  return { ok: true };
}

/** Новая ссылка-приглашение: старая перестаёт работать. */
export async function regenerateGuildCodeAction(): Promise<Result> {
  const user = await requireUser();
  const membership = await myMembership(user.id);
  if (!membership || membership.guild.leaderId !== user.id) return { ok: false, error: NOT_LEADER };
  await db.guild.update({ where: { id: membership.guildId }, data: { code: await freshCode(db) } });
  revalidatePath("/guild");
  return { ok: true };
}

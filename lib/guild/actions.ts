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
const NOT_FOUND = "Гильдия не найдена";
const NOT_MEMBER = "Вы не в гильдии";
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

/**
 * Заблокировать строки гильдий до конца транзакции — по порядку id, чтобы встречные переходы не ждали друг друга.
 * Состав, выход и смена главы меняются только под этой блокировкой. Возвращает id тех, что ещё существуют.
 */
async function lockGuilds(tx: Tx, ids: string[]) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Guild" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE
  `;
  return new Set(rows.map((r) => r.id));
}

/** Выйти из гильдии (строка уже заблокирована): глава с участниками — отказ, последний — удалить гильдию. */
async function leave(tx: Tx, userId: string, guildId: string): Promise<string | null> {
  const guild = await tx.guild.findUniqueOrThrow({ where: { id: guildId }, select: { leaderId: true, _count: { select: { members: true } } } });
  const block = leaveBlock(guild.leaderId === userId, guild._count.members);
  if (block) return block;
  await tx.guildMember.delete({ where: { userId } });
  if (guild._count.members === 1) await tx.guild.delete({ where: { id: guildId } });
  return null;
}

/** Моё членство и глава ли я (для действий главы). */
async function myMembership(userId: string) {
  return db.guildMember.findUnique({
    where: { userId },
    select: { guildId: true, guild: { select: { leaderId: true } } },
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

/**
 * Вступить по коду: сразу, без заявки; прежняя гильдия покидается. Блокируются обе гильдии — двое не займут одно место,
 * а глава-одиночка не уйдёт из своей, пока в неё вступают.
 */
export async function joinGuildAction(input: string): Promise<Result> {
  const user = await requireUser();
  const code = normalizeFriendCode(String(input ?? ""));
  if (!code) return { ok: false, error: NOT_FOUND };
  const me = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
  if (!me.nickname) return { ok: false, error: "Нужен ник" };

  const result = await db.$transaction(async (tx) => {
    // Запросы по очереди: у транзакции одно соединение
    const target = await tx.guild.findUnique({ where: { code }, select: { id: true } });
    if (!target) return NOT_FOUND;
    const before = await tx.guildMember.findUnique({ where: { userId: user.id }, select: { guildId: true } });
    const locked = await lockGuilds(tx, before && before.guildId !== target.id ? [target.id, before.guildId] : [target.id]);
    // Под блокировкой — свежие данные: пока ждали, состав, глава или ссылка могли измениться
    const guild = locked.has(target.id)
      ? await tx.guild.findUniqueOrThrow({ where: { id: target.id }, select: { name: true, code: true, leaderId: true, _count: { select: { members: true } } } })
      : null;
    if (guild?.code !== code) return NOT_FOUND;
    const current = await tx.guildMember.findUnique({
      where: { userId: user.id },
      select: { guildId: true, guild: { select: { leaderId: true, _count: { select: { members: true } } } } },
    });
    if (current && current.guildId !== target.id && !locked.has(current.guildId)) return "Попробуйте ещё раз";
    const block = joinBlock({
      members: guild._count.members,
      inThis: current?.guildId === target.id,
      current: current ? { isLeader: current.guild.leaderId === user.id, members: current.guild._count.members } : null,
    });
    if (block === "same") return null;
    if (block) return JOIN_ERRORS[block];
    if (current && (await leave(tx, user.id, current.guildId))) return JOIN_ERRORS.leader;
    await tx.guildMember.create({ data: { userId: user.id, guildId: target.id } });
    await notify(
      tx,
      guild.leaderId,
      { type: NotificationType.SOCIAL, title: `${me.nickname} вступил(а) в гильдию`, body: guild.name, url: "/guild" },
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
  const membership = await db.guildMember.findUnique({ where: { userId: user.id }, select: { guildId: true } });
  if (!membership) return { ok: false, error: NOT_MEMBER };
  const error = await db.$transaction(async (tx) => {
    // Под блокировкой: в гильдию-одиночку главы могли вступить, пока он жал «Выйти»
    await lockGuilds(tx, [membership.guildId]);
    const still = await tx.guildMember.findUnique({ where: { userId: user.id }, select: { guildId: true } });
    if (still?.guildId !== membership.guildId) return NOT_MEMBER;
    return leave(tx, user.id, membership.guildId);
  });
  if (error) return { ok: false, error };
  revalidatePath("/guild");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Действие главы над участником своей гильдии (не над собой). Права и состав проверяются под блокировкой гильдии —
 * передача главенства уходящему или две вкладки не оставят гильдию без главы.
 */
async function asLeader(memberId: string, act: (tx: Tx, guild: { id: string; name: string }) => Promise<void>): Promise<Result> {
  const user = await requireUser();
  if (memberId === user.id) return { ok: false, error: "Нельзя выбрать себя" };
  const membership = await db.guildMember.findUnique({ where: { userId: user.id }, select: { guildId: true } });
  if (!membership) return { ok: false, error: NOT_LEADER };
  const error = await db.$transaction(async (tx) => {
    await lockGuilds(tx, [membership.guildId]);
    const guild = await tx.guild.findUnique({ where: { id: membership.guildId }, select: { id: true, name: true, leaderId: true } });
    if (guild?.leaderId !== user.id) return NOT_LEADER;
    const target = await tx.guildMember.findUnique({ where: { userId: String(memberId) }, select: { guildId: true } });
    if (target?.guildId !== guild.id) return "Участник не найден";
    await act(tx, guild);
    return null;
  });
  if (error) return { ok: false, error };
  revalidatePath("/guild");
  return { ok: true };
}

export async function kickMemberAction(memberId: string): Promise<Result> {
  return asLeader(memberId, async (tx, guild) => {
    await tx.guildMember.delete({ where: { userId: memberId } });
    await notify(
      tx,
      memberId,
      { type: NotificationType.SOCIAL, title: `Вас исключили из гильдии «${guild.name}»`, body: "Можно создать свою или вступить по ссылке", url: "/guild" },
      { push: true },
    );
  });
}

export async function transferLeadAction(memberId: string): Promise<Result> {
  return asLeader(memberId, async (tx, guild) => {
    await tx.guild.update({ where: { id: guild.id }, data: { leaderId: memberId } });
    await notify(
      tx,
      memberId,
      { type: NotificationType.SOCIAL, title: `Вы теперь глава гильдии «${guild.name}»`, body: "Приглашайте, исключайте, меняйте ссылку", url: "/guild" },
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

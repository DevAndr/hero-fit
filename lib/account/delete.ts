import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType, type ClubStatus } from "@/generated/prisma/enums";
import { scrubRecapLeague, type DeletionInput } from "@/lib/account/rules";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import type { RecapData } from "@/lib/recap/types";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof db;

/** Наследник гильдии — самый давний участник, кроме удаляемого. */
const guildHeir = (client: Client, guildId: string, userId: string) =>
  client.guildMember.findFirst({
    where: { guildId, userId: { not: userId } },
    orderBy: { joinedAt: "asc" },
    select: { userId: true, user: { select: { nickname: true } } },
  });

/** Наследник клуба — самый давний участник, кроме удаляемого (админ клуба не обязан в нём состоять). */
const clubHeir = (client: Client, clubId: string, userId: string) =>
  client.clubMember.findFirst({
    where: { clubId, userId: { not: userId } },
    orderBy: { joinedAt: "asc" },
    select: { userId: true, user: { select: { nickname: true } } },
  });

const transferable = (status: ClubStatus) => status === "APPROVED" || status === "HIDDEN";

/** Что перейдёт другим — для диалога удаления (`deletionPreview`). */
export async function getDeletionInput(userId: string): Promise<DeletionInput> {
  const [guild, clubs] = await Promise.all([
    db.guild.findFirst({ where: { leaderId: userId }, select: { id: true, name: true } }),
    db.club.findMany({ where: { adminId: userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, status: true } }),
  ]);
  const heirName = (h: { user: { nickname: string | null } } | null) => (h ? (h.user.nickname ?? "участнику без ника") : null);
  return {
    guild: guild ? { name: guild.name, heir: heirName(await guildHeir(db, guild.id, userId)) } : null,
    clubs: await Promise.all(
      clubs.map(async (c) => ({ name: c.name, status: c.status, heir: transferable(c.status) ? heirName(await clubHeir(db, c.id, userId)) : null })),
    ),
  };
}

/**
 * Удаление аккаунта — в транзакции. Гильдия и клубы передаются самым давним участникам (или удаляются), из флагов и
 * чужих итогов недели убираются следы, остальное — каскадом `user.delete` (Restrict есть только у главы гильдии и
 * админа клуба — их снимаем раньше). Порядок блокировок как везде: пользователь → гильдия/клуб.
 */
export async function deleteAccount(tx: Tx, userId: string): Promise<void> {
  const [me] = await tx.$queryRaw<{ nickname: string | null }[]>`SELECT nickname FROM "User" WHERE id = ${userId} FOR UPDATE`;
  if (!me) return;

  const guilds = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM "Guild" WHERE "leaderId" = ${userId} FOR UPDATE`;
  for (const g of guilds) {
    const heir = await guildHeir(tx, g.id, userId);
    if (!heir) {
      await tx.guild.delete({ where: { id: g.id } });
      continue;
    }
    await tx.guild.update({ where: { id: g.id }, data: { leaderId: heir.userId } });
    await notify(tx, heir.userId, { type: NotificationType.SOCIAL, title: `Ты теперь глава гильдии «${g.name}»`, body: "Прежний глава удалил аккаунт", url: "/guild" }, { push: true });
  }

  const clubs = await tx.$queryRaw<{ id: string; name: string; status: ClubStatus }[]>`
    SELECT id, name, status FROM "Club" WHERE "adminId" = ${userId} ORDER BY id FOR UPDATE`;
  for (const c of clubs) {
    const heir = transferable(c.status) ? await clubHeir(tx, c.id, userId) : null;
    if (!heir) {
      await tx.club.delete({ where: { id: c.id } });
      continue;
    }
    await tx.club.update({ where: { id: c.id }, data: { adminId: heir.userId } });
    await notify(
      tx,
      heir.userId,
      { type: NotificationType.SOCIAL, title: `Ты теперь админ клуба «${c.name}»`, body: "Прежний админ удалил аккаунт", url: `/clubs/${c.id}/manage` },
      { push: true },
    );
  }

  await tx.$executeRaw`UPDATE "FeatureFlag" SET "userIds" = array_remove("userIds", ${userId}) WHERE ${userId} = ANY("userIds")`;

  // Чужие итоги недели: строка лиги с моим ником — «Удалённый игрок» (в снимке ник без id)
  if (me.nickname) {
    const recaps = await tx.$queryRaw<{ id: string; data: RecapData }[]>`
      SELECT id, data FROM "WeeklyRecap"
      WHERE "userId" <> ${userId}
        AND jsonb_typeof(data->'league'->'rows') = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'league'->'rows') r WHERE lower(r->>'nickname') = lower(${me.nickname}))`;
    for (const r of recaps) {
      const scrubbed = scrubRecapLeague(r.data, me.nickname);
      if (scrubbed.changed) await tx.weeklyRecap.update({ where: { id: r.id }, data: { data: scrubbed.data as unknown as Prisma.InputJsonValue } });
    }
  }

  await tx.user.delete({ where: { id: userId } });
}

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
  const [me] = await tx.$queryRaw<{ nickname: string | null; login: string; email: string | null }[]>`
    SELECT nickname, login, email FROM "User" WHERE id = ${userId} FOR UPDATE`;
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

  // Счётчик входа хранит логин и email ключом — после удаления их не остаётся
  await tx.loginThrottle.deleteMany({ where: { key: { in: [`id:${me.login.toLowerCase()}`, ...(me.email ? [`id:${me.email.toLowerCase()}`] : [])] } } });

  await rehomeExercises(tx, userId);
  // Свои тренировки и шаблоны — раньше пользователя: на свои упражнения из них ссылки с Restrict
  await tx.workout.deleteMany({ where: { userId } });
  await tx.workoutTemplate.deleteMany({ where: { userId } });
  await tx.user.delete({ where: { id: userId } });
}

/**
 * Мои упражнения в чужих данных (клиент тренировался по шаблону тренера, добавил его упражнение в свой шаблон):
 * каждому такому пользователю — своя архивная копия упражнения, его тренировки, шаблоны, рекорды, цели, ачивки и
 * задания тренера переводятся на неё. Иначе удаление упадёт на Restrict, а Cascade унёс бы чужие рекорды и цели.
 */
async function rehomeExercises(tx: Tx, userId: string) {
  const pairs = await tx.$queryRaw<{ exerciseId: string; ownerId: string }[]>`
    WITH mine AS (SELECT id FROM "Exercise" WHERE "userId" = ${userId})
    SELECT DISTINCT "exerciseId", "ownerId" FROM (
      SELECT we."exerciseId", w."userId" AS "ownerId" FROM "WorkoutExercise" we JOIN "Workout" w ON w.id = we."workoutId"
        WHERE we."exerciseId" IN (SELECT id FROM mine)
      UNION SELECT te."exerciseId", t."userId" FROM "TemplateExercise" te JOIN "WorkoutTemplate" t ON t.id = te."templateId"
        WHERE te."exerciseId" IN (SELECT id FROM mine) AND t."userId" IS NOT NULL
      UNION SELECT "exerciseId", "userId" FROM "PersonalRecord" WHERE "exerciseId" IN (SELECT id FROM mine)
      UNION SELECT "exerciseId", "userId" FROM "Goal" WHERE "exerciseId" IN (SELECT id FROM mine)
      UNION SELECT "exerciseId", "userId" FROM "UserAchievement" WHERE "exerciseId" IN (SELECT id FROM mine)
      UNION SELECT "exerciseId", "clientId" FROM "CoachTarget" WHERE "exerciseId" IN (SELECT id FROM mine)
    ) refs
    WHERE "ownerId" <> ${userId}`;
  for (const { exerciseId: from, ownerId } of pairs) {
    const source = await tx.exercise.findUniqueOrThrow({
      where: { id: from },
      select: { name: true, description: true, muscleGroups: true, isBodyweight: true, defaultRestSec: true },
    });
    const { id: to } = await tx.exercise.create({ data: { ...source, userId: ownerId, archivedAt: new Date() }, select: { id: true } });
    await tx.$executeRaw`UPDATE "WorkoutExercise" we SET "exerciseId" = ${to} FROM "Workout" w
      WHERE w.id = we."workoutId" AND w."userId" = ${ownerId} AND we."exerciseId" = ${from}`;
    await tx.$executeRaw`UPDATE "TemplateExercise" te SET "exerciseId" = ${to} FROM "WorkoutTemplate" t
      WHERE t.id = te."templateId" AND t."userId" = ${ownerId} AND te."exerciseId" = ${from}`;
    await tx.personalRecord.updateMany({ where: { userId: ownerId, exerciseId: from }, data: { exerciseId: to } });
    await tx.goal.updateMany({ where: { userId: ownerId, exerciseId: from }, data: { exerciseId: to } });
    await tx.userAchievement.updateMany({ where: { userId: ownerId, exerciseId: from }, data: { exerciseId: to } });
    await tx.coachTarget.updateMany({ where: { clientId: ownerId, exerciseId: from }, data: { exerciseId: to } });
  }
}

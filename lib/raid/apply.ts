import "server-only";
import { NotificationType, Prisma } from "@/generated/prisma/client";
import { notify } from "@/lib/notifications/service";
import { getOrCreateRaid } from "@/lib/raid/queries";
import { hitCounts, pickMvp, raidBossName, raidRewardXp } from "@/lib/raid/rules";
import type { FinishMeta } from "@/lib/workouts/finish";

/**
 * Урон завершённой тренировки по рейду гильдии игрока (в транзакции `finishWorkout`).
 * Рейд — текущего окна по реальному времени `now`: тренировка, завершённая офлайн в прошлую неделю, не бьёт.
 * Строка рейда блокируется — параллельные финиши не дадут двух побед и не потеряют урон.
 */
export async function applyRaidHit(
  tx: Prisma.TransactionClient,
  a: { userId: string; workoutId: string; finishedAt: Date; damage: number; crits: number; now: Date },
): Promise<FinishMeta["raid"]> {
  const member = await tx.guildMember.findUnique({ where: { userId: a.userId }, select: { guildId: true, joinedAt: true } });
  if (!member) return undefined;
  const created = await getOrCreateRaid(tx, member.guildId, a.now);
  if (!hitCounts({ finishedAt: a.finishedAt, joinedAt: member.joinedAt, startsAt: created.startsAt, endsAt: created.endsAt })) return undefined;

  await tx.$queryRaw`SELECT id FROM "RaidWeek" WHERE id = ${created.id} FOR UPDATE`;
  const raid = await tx.raidWeek.findUniqueOrThrow({ where: { id: created.id } });
  if (await tx.raidHit.findUnique({ where: { workoutId: a.workoutId }, select: { id: true } })) return undefined;

  const before = await tx.raidHit.aggregate({ where: { raidId: raid.id }, _sum: { damage: true } });
  const damageBefore = before._sum.damage ?? 0;
  await tx.raidHit.create({ data: { raidId: raid.id, userId: a.userId, workoutId: a.workoutId, damage: a.damage, crits: a.crits } });

  let defeated = false;
  let rewardXp: number | undefined;
  if (!raid.defeatedAt && damageBefore + a.damage >= raid.hp) {
    const hits = await tx.raidHit.findMany({ where: { raidId: raid.id }, select: { userId: true, damage: true, createdAt: true } });
    const mvp = pickMvp(hits);
    const { count } = await tx.raidWeek.updateMany({ where: { id: raid.id, defeatedAt: null }, data: { defeatedAt: a.now, mvpUserId: mvp } });
    defeated = count === 1;
    if (defeated) {
      const members = await tx.guildMember.findMany({
        where: { guildId: raid.guildId },
        select: { userId: true, user: { select: { notifyAchievements: true } } },
      });
      const inGuild = new Set(members.map((m) => m.userId));
      const hitters = [...new Set(hits.map((h) => h.userId))].filter((id) => inGuild.has(id));
      await tx.raidReward.createMany({
        data: hitters.map((userId) => ({ raidId: raid.id, userId, mvp: userId === mvp, xp: raidRewardXp(raid.hp, hitters.length, userId === mvp) })),
      });
      if (hitters.includes(a.userId)) rewardXp = raidRewardXp(raid.hp, hitters.length, a.userId === mvp);
      for (const m of members) {
        await notify(
          tx,
          m.userId,
          { type: NotificationType.RAID, title: `⚔ Рейд-босс повержен: ${raidBossName(raid.bossCode)}`, body: "Сундук ждёт на странице гильдии", url: "/guild" },
          { push: m.user.notifyAchievements },
        );
      }
    }
  }

  return {
    raidId: raid.id,
    code: raid.bossCode,
    name: raidBossName(raid.bossCode),
    damage: a.damage,
    hpBefore: Math.max(0, raid.hp - damageBefore),
    hpAfter: Math.max(0, raid.hp - damageBefore - a.damage),
    hp: raid.hp,
    defeated,
    ...(rewardXp !== undefined ? { rewardXp } : {}),
  };
}

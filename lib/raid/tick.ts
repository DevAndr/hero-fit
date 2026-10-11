import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { raidReminderDay, raidReminderDue, raidReminderText } from "@/lib/raid/rules";

/**
 * «Гильдии не хватает N урона»: с чт 12:00 в поясе главы, рейд текущего окна не повержен — одно уведомление
 * каждому участнику на рейд (условная отметка `thursdayNotifiedAt`). now — тестовые часы в e2e.
 */
export async function processRaidReminders(now: Date): Promise<number> {
  if (!raidReminderDay(now)) return 0;
  const raids = await db.raidWeek.findMany({
    where: { defeatedAt: null, thursdayNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    select: { id: true, startsAt: true, hp: true, guildId: true, guild: { select: { leader: { select: { timeZone: true } } } } },
  });
  let sent = 0;
  for (const raid of raids) {
    const tz = safeTimeZone(raid.guild.leader.timeZone);
    if (!raidReminderDue({ now, tz, startsAt: raid.startsAt, defeated: false, notified: false })) continue;
    sent += await db.$transaction(async (tx) => {
      const { count } = await tx.raidWeek.updateMany({ where: { id: raid.id, thursdayNotifiedAt: null, defeatedAt: null }, data: { thursdayNotifiedAt: now } });
      if (count === 0) return 0;
      const done = await tx.raidHit.aggregate({ where: { raidId: raid.id }, _sum: { damage: true } });
      const text = raidReminderText(Math.max(0, raid.hp - (done._sum.damage ?? 0)));
      // Участники — только у рейда, которому пора: остальные тики их не читают
      const members = await tx.guildMember.findMany({ where: { guildId: raid.guildId }, select: { userId: true, user: { select: { notifyAchievements: true } } } });
      for (const m of members) {
        await notify(tx, m.userId, { type: NotificationType.RAID, ...text, url: "/guild" }, { push: m.user.notifyAchievements });
      }
      return members.length;
    });
  }
  return sent;
}

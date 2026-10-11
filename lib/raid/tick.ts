import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { raidReminderDue, raidReminderText } from "@/lib/raid/rules";

/**
 * «Гильдии не хватает N урона»: с чт 12:00 в поясе главы, рейд текущего окна не повержен — одно уведомление
 * каждому участнику на рейд (условная отметка `thursdayNotifiedAt`). now — тестовые часы в e2e.
 */
export async function processRaidReminders(now: Date): Promise<number> {
  const raids = await db.raidWeek.findMany({
    where: { defeatedAt: null, thursdayNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
    select: {
      id: true,
      startsAt: true,
      hp: true,
      guild: { select: { leader: { select: { timeZone: true } }, members: { select: { userId: true, user: { select: { notifyAchievements: true } } } } } },
    },
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
      for (const m of raid.guild.members) {
        await notify(tx, m.userId, { type: NotificationType.RAID, ...text, url: "/guild" }, { push: m.user.notifyAchievements });
      }
      return raid.guild.members.length;
    });
  }
  return sent;
}

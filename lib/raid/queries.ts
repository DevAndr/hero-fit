import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { damageByWeek } from "@/lib/boss/queries";
import { safeTimeZone } from "@/lib/daily-login";
import { addWeeks, localMidnight, weekKey } from "@/lib/progress/weekly-streak";
import { memberShare, RAID_HISTORY_WEEKS, raidBossForWeek, raidHp } from "@/lib/raid/rules";

type Client = Prisma.TransactionClient | typeof db;

/**
 * Рейд гильдии, окно которого содержит `now`; нет — создаётся на неделю `now` в поясе главы.
 * HP — по текущему составу: доля каждого — урон 4 прошлых недель в его поясе (`memberShare`).
 */
export async function getOrCreateRaid(client: Client, guildId: string, now: Date) {
  const existing = await client.raidWeek.findFirst({ where: { guildId, startsAt: { lte: now }, endsAt: { gt: now } } });
  if (existing) return existing;

  const guild = await client.guild.findUniqueOrThrow({
    where: { id: guildId },
    select: { leader: { select: { timeZone: true } }, members: { select: { userId: true, user: { select: { timeZone: true } } } } },
  });
  const tz = safeTimeZone(guild.leader.timeZone);
  const week = weekKey(now, tz);
  const shares: number[] = [];
  for (const m of guild.members) {
    const mtz = safeTimeZone(m.user.timeZone);
    const current = weekKey(now, mtz);
    const byWeek = await damageByWeek(client, m.userId, mtz, addWeeks(current, -RAID_HISTORY_WEEKS), addWeeks(current, -1));
    shares.push(memberShare(Array.from({ length: RAID_HISTORY_WEEKS }, (_, i) => byWeek.get(addWeeks(current, -(i + 1)))?.damage ?? 0)));
  }
  // upsert — два параллельных первых обращения не создадут двух рейдов
  return client.raidWeek.upsert({
    where: { guildId_week: { guildId, week } },
    create: {
      guildId,
      week,
      startsAt: localMidnight(week, tz),
      endsAt: localMidnight(addWeeks(week, 1), tz),
      bossCode: raidBossForWeek(week),
      hp: raidHp(shares),
    },
    update: {},
  });
}

import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { damageByWeek } from "@/lib/boss/queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { addWeeks, localMidnight, weekKey } from "@/lib/progress/weekly-streak";
import { memberShare, RAID_CHEST_WEEKS, RAID_HISTORY_WEEKS, raidBossForWeek, raidBossName, raidHp } from "@/lib/raid/rules";

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

const DAY_MS = 24 * 3_600_000;

export type RaidView = {
  id: string;
  code: string;
  name: string;
  hp: number;
  damage: number;
  /** Дней до конца рейда, включая сегодня (в поясе смотрящего). */
  daysLeft: number;
  defeatedAt: string | null;
  members: { userId: string; nickname: string; damage: number; mvp: boolean; former: boolean }[];
  /** Неоткрытая награда смотрящего по любому рейду гильдии, который ещё можно открыть. */
  myReward: { raidId: string; xp: number; mvp: boolean; name: string } | null;
};

/** Рейд текущей недели для `/guild` и дашборда (создаётся при первом обращении). */
export async function getRaidView(guildId: string, viewerId: string, viewerTz: string, now = new Date()): Promise<RaidView> {
  const raid = await getOrCreateRaid(db, guildId, now);
  const [hits, members, rewards] = await Promise.all([
    db.raidHit.groupBy({ by: ["userId"], where: { raidId: raid.id }, _sum: { damage: true } }),
    db.guildMember.findMany({ where: { guildId }, select: { userId: true, user: { select: { nickname: true } } } }),
    db.raidReward.findMany({
      where: { userId: viewerId, openedAt: null, raid: { guildId, defeatedAt: { gt: new Date(now.getTime() - RAID_CHEST_WEEKS * 7 * DAY_MS) } } },
      select: { raidId: true, xp: true, mvp: true, raid: { select: { bossCode: true } } },
      orderBy: { createdAt: "asc" },
      take: 1,
    }),
  ]);
  const byUser = new Map(hits.map((h) => [h.userId, h._sum.damage ?? 0]));
  const current = new Set(members.map((m) => m.userId));
  const formerIds = [...byUser.keys()].filter((id) => !current.has(id));
  const former = formerIds.length
    ? await db.user.findMany({ where: { id: { in: formerIds } }, select: { id: true, nickname: true } })
    : [];
  const list = [
    ...members.map((m) => ({ userId: m.userId, nickname: m.user.nickname ?? "", damage: byUser.get(m.userId) ?? 0, mvp: raid.mvpUserId === m.userId, former: false })),
    ...former.map((u) => ({ userId: u.id, nickname: u.nickname ?? "", damage: byUser.get(u.id) ?? 0, mvp: raid.mvpUserId === u.id, former: true })),
  ].sort((a, b) => Number(b.mvp) - Number(a.mvp) || b.damage - a.damage || a.nickname.localeCompare(b.nickname, "ru"));
  const endDay = dayKey(new Date(raid.endsAt.getTime() - 1), viewerTz);
  const daysLeft = Math.max(1, Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${dayKey(now, viewerTz)}T00:00:00Z`)) / DAY_MS) + 1);
  const reward = rewards[0];
  return {
    id: raid.id,
    code: raid.bossCode,
    name: raidBossName(raid.bossCode),
    hp: raid.hp,
    damage: [...byUser.values()].reduce((a, b) => a + b, 0),
    daysLeft,
    defeatedAt: raid.defeatedAt?.toISOString() ?? null,
    members: list,
    myReward: reward ? { raidId: reward.raidId, xp: reward.xp, mvp: reward.mvp, name: raidBossName(reward.raid.bossCode) } : null,
  };
}

export type RaidHistoryEntry = { week: string; code: string; name: string; hp: number; damage: number; defeated: boolean; mine: number };

/** Прошлые рейды гильдии (до 8, без текущего), новые сверху. */
export async function getRaidHistory(guildId: string, viewerId: string, now = new Date()): Promise<RaidHistoryEntry[]> {
  const raids = await db.raidWeek.findMany({
    where: { guildId, endsAt: { lte: now } },
    orderBy: { startsAt: "desc" },
    take: 8,
    select: { id: true, week: true, bossCode: true, hp: true, defeatedAt: true, hits: { select: { userId: true, damage: true } } },
  });
  return raids.map((r) => ({
    week: r.week,
    code: r.bossCode,
    name: raidBossName(r.bossCode),
    hp: r.hp,
    damage: r.hits.reduce((s, h) => s + h.damage, 0),
    defeated: r.defeatedAt !== null,
    mine: r.hits.filter((h) => h.userId === viewerId).reduce((s, h) => s + h.damage, 0),
  }));
}

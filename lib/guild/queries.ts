import "server-only";
import { db } from "@/lib/db";
import { LEAGUE_XP, weekBounds } from "@/lib/social/queries";
import { normalizeFriendCode } from "@/lib/social/league";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { cosmeticsLoader } from "@/lib/shop/cosmetics-loader";
import { titleLabel } from "@/lib/titles/catalog";

export type GuildMemberView = { id: string; nickname: string; title: string | null; cosmetics: Cosmetics; workouts: number; xp: number; isLeader: boolean };

/** Моя гильдия: состав с недельными цифрами (как в лиге; неделя — по поясу смотрящего), сначала больше опыта. */
export async function getMyGuild(userId: string, timeZone: string) {
  const me = await db.guildMember.findUnique({
    where: { userId },
    select: { guild: { select: { id: true, name: true, emblem: true, code: true, leaderId: true } } },
  });
  if (!me) return null;
  const { guild } = me;
  const rows = await db.$queryRaw<{ id: string; nickname: string; titleCode: string | null; avatarCode: string | null; frameCode: string | null; nickColorCode: string | null; xp: number; workouts: number }[]>`
    WITH b AS (${weekBounds(timeZone, 0)})
    SELECT u.id, COALESCE(u.nickname, '') AS nickname, u."titleCode", u."avatarCode", u."frameCode", u."nickColorCode",
           COALESCE((
             SELECT SUM(x.amount) FROM "XpEvent" x
             WHERE x."userId" = u.id AND ${LEAGUE_XP}
               AND (x."createdAt" AT TIME ZONE 'UTC') >= b.start_at AND (x."createdAt" AT TIME ZONE 'UTC') < b.end_at
           ), 0)::int AS xp,
           (
             SELECT COUNT(*) FROM "Workout" w
             WHERE w."userId" = u.id AND w.status = 'COMPLETED' AND NOT w."stretchOnly"
               AND (w."finishedAt" AT TIME ZONE 'UTC') >= b.start_at AND (w."finishedAt" AT TIME ZONE 'UTC') < b.end_at
           )::int AS workouts
    FROM "GuildMember" m JOIN "User" u ON u.id = m."userId", b
    WHERE m."guildId" = ${guild.id}
  `;
  const cosmetics = await cosmeticsLoader();
  const members = rows
    .map((r) => ({ id: r.id, nickname: r.nickname, title: titleLabel(r.titleCode), cosmetics: cosmetics(r), workouts: r.workouts, xp: r.xp, isLeader: r.id === guild.leaderId }))
    .sort((a, b) => b.xp - a.xp || a.nickname.localeCompare(b.nickname, "ru"));
  return { ...guild, members };
}

export type MyGuild = NonNullable<Awaited<ReturnType<typeof getMyGuild>>>;

/** Гильдия по коду приглашения — для экрана вступления; неверный код — null. */
export async function getGuildByCode(input: string) {
  const code = normalizeFriendCode(input);
  if (!code) return null;
  return db.guild.findUnique({
    where: { code },
    select: { id: true, name: true, emblem: true, members: { orderBy: { joinedAt: "asc" }, select: { user: { select: { nickname: true } } } } },
  });
}

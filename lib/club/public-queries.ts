import "server-only";
import { cache } from "react";
import type { CurrentUser } from "@/lib/auth/dal";
import { cityPath, clubPageAccess, clubPath, MIN_MEMBERS_FOR_STATS, type ClubPublicStats } from "@/lib/club/public";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import type { ClubStatus } from "@/generated/prisma/client";

export type PublicClub = {
  id: string;
  name: string;
  city: string;
  address: string;
  about: string;
  code: string;
  status: ClubStatus;
  adminId: string;
  slug: string;
  citySlug: string;
  publishedAt: Date | null;
  updatedAt: Date;
};

/** Клуб по адресу страницы (без проверок видимости — их делает `resolveClubPage`). */
export const getPublicClub = cache(async (citySlug: string, slug: string): Promise<PublicClub | null> => {
  const club = await db.club.findUnique({
    where: { citySlug_slug: { citySlug, slug } },
    select: {
      id: true,
      name: true,
      city: true,
      address: true,
      about: true,
      code: true,
      status: true,
      adminId: true,
      slug: true,
      citySlug: true,
      publishedAt: true,
      updatedAt: true,
    },
  });
  return club ? { ...club, slug: club.slug!, citySlug: club.citySlug! } : null;
});

/** Страница клуба для смотрящего: открыта всем, предпросмотр (админ клуба или приложения) или null — 404. */
export async function resolveClubPage(
  citySlug: string,
  slug: string,
  viewer: CurrentUser | null,
): Promise<{ club: PublicClub; access: "open" | "preview" } | null> {
  const club = await getPublicClub(citySlug, slug);
  if (!club) return null;
  const access = clubPageAccess({
    status: club.status,
    publishedAt: club.publishedAt,
    slug: club.slug,
    flagFull: await isEnabled("clubs", null),
    // Предпросмотр — только с флагом у самого смотрящего: kill switch закрывает и его
    canManage: Boolean(viewer && (viewer.id === club.adminId || viewer.isAdmin) && (await isEnabled("clubs", viewer.id))),
  });
  return access === "none" ? null : { club, access };
}

const DAY = 86_400_000;

/** Цифры клуба: тренировки текущих участников после вступления за 7 и 30 дней (скользящие окна) и часы за 30 дней. */
export async function getClubPublicStats(clubId: string, now = new Date()): Promise<ClubPublicStats> {
  const week = new Date(now.getTime() - 7 * DAY);
  const month = new Date(now.getTime() - 30 * DAY);
  const [row] = await db.$queryRaw<{ members: number; week: number; month: number; monthSec: number }[]>`
    SELECT
      (SELECT COUNT(*) FROM "ClubMember" WHERE "clubId" = ${clubId})::int AS members,
      COUNT(w.id) FILTER (WHERE w."finishedAt" >= ${week})::int AS week,
      COUNT(w.id)::int AS month,
      COALESCE(SUM(w."durationSec"), 0)::int AS "monthSec"
    FROM "ClubMember" m
    JOIN "Workout" w ON w."userId" = m."userId" AND w.status = 'COMPLETED'
      AND w."finishedAt" >= m."joinedAt" AND w."finishedAt" >= ${month}
    WHERE m."clubId" = ${clubId}
  `;
  return row ?? { members: 0, week: 0, month: 0, monthSec: 0 };
}

const openClubs = { status: "APPROVED", publishedAt: { not: null }, slug: { not: null }, citySlug: { not: null } } as const;

export type CityClub = { name: string; address: string; path: string; members: number; week: number | null };

/** Залы города: только при открытых клубах (флаг на 100 %); по участникам, затем по названию. Нет залов — null. */
export async function getCityClubs(citySlug: string, now = new Date()): Promise<{ city: string; clubs: CityClub[] } | null> {
  if (!(await isEnabled("clubs", null))) return null;
  const clubs = await db.club.findMany({
    where: { ...openClubs, citySlug },
    select: { id: true, name: true, address: true, city: true, slug: true, _count: { select: { members: true } } },
  });
  if (!clubs.length) return null;
  const since = new Date(now.getTime() - 7 * DAY);
  const counts = await db.$queryRaw<{ clubId: string; week: number }[]>`
    SELECT m."clubId", COUNT(w.id)::int AS week
    FROM "ClubMember" m
    JOIN "Workout" w ON w."userId" = m."userId" AND w.status = 'COMPLETED'
      AND w."finishedAt" >= m."joinedAt" AND w."finishedAt" >= ${since}
    WHERE m."clubId" = ANY(${clubs.map((c) => c.id)})
    GROUP BY m."clubId"
  `;
  const week = new Map(counts.map((c) => [c.clubId, c.week]));
  const sorted = [...clubs].sort((a, b) => b._count.members - a._count.members || a.name.localeCompare(b.name, "ru"));
  return {
    city: sorted[0].city,
    clubs: sorted.map((c) => ({
      name: c.name,
      address: c.address,
      path: clubPath(citySlug, c.slug!),
      members: c._count.members,
      week: c._count.members >= MIN_MEMBERS_FOR_STATS ? (week.get(c.id) ?? 0) : null,
    })),
  };
}

/** «Популярные города» лендинга: по числу открытых клубов, затем участников; название — как у самого крупного клуба. */
export async function getPopularCities(limit: number): Promise<{ city: string; path: string }[]> {
  if (!(await isEnabled("clubs", null))) return [];
  const rows = await db.$queryRaw<{ citySlug: string; city: string }[]>`
    WITH c AS (
      SELECT c."citySlug", c.city, (SELECT COUNT(*) FROM "ClubMember" m WHERE m."clubId" = c.id) AS members
      FROM "Club" c
      WHERE c.status = 'APPROVED' AND c."publishedAt" IS NOT NULL AND c.slug IS NOT NULL AND c."citySlug" IS NOT NULL
    )
    SELECT "citySlug", (ARRAY_AGG(city ORDER BY members DESC))[1] AS city
    FROM c
    GROUP BY "citySlug"
    ORDER BY COUNT(*) DESC, SUM(members) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({ city: r.city, path: cityPath(r.citySlug) }));
}

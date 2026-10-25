import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { cityPath, clubPath } from "@/lib/club/public";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isEnabled } from "@/lib/flags/server";
import { absoluteUrl, sitemapEntries } from "@/lib/seo";

/** Время сборки (next.config.ts → env.BUILD_TIME): контент статических страниц меняется только с деплоем. */
const BUILT_AT = new Date(process.env.BUILD_TIME ?? Date.now());

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // домен — из окружения сервера, а не сборки
  // Опубликованные страницы тренеров с включённым режимом тренера
  const [coaches, clubs, trainers] = await Promise.all([
    db.coachProfile.findMany({
      where: { publishedAt: { not: null }, user: { isCoach: true, nickname: { not: null } } },
      select: { updatedAt: true, user: { select: { nickname: true } } },
    }),
    // Страницы клубов — только когда клубы открыты всем (флаг на 100 %)
    (await isEnabled("clubs", null))
      ? db.club.findMany({
          where: { status: "APPROVED", publishedAt: { not: null }, slug: { not: null }, citySlug: { not: null } },
          select: { slug: true, citySlug: true, updatedAt: true },
        })
      : [],
    // Каталог тренеров — когда открыт всем (флаг coach_catalog на 100 %)
    isEnabled("coach_catalog", null),
  ]);
  const cities = new Map<string, Date>();
  for (const c of clubs) {
    const prev = cities.get(c.citySlug!);
    if (!prev || prev < c.updatedAt) cities.set(c.citySlug!, c.updatedAt);
  }
  const entries = sitemapEntries(
    env.APP_URL,
    BUILT_AT,
    coaches.map((c) => ({ nickname: c.user.nickname!, updatedAt: c.updatedAt })),
    clubs.map((c) => ({ path: clubPath(c.citySlug!, c.slug!), updatedAt: c.updatedAt })),
    [...cities].map(([citySlug, updatedAt]) => ({ path: cityPath(citySlug), updatedAt })),
  );
  if (!trainers) return entries;
  const listedAt = coaches.reduce((max, c) => (c.updatedAt > max ? c.updatedAt : max), BUILT_AT);
  return [...entries, { url: absoluteUrl(env.APP_URL, "/trainers"), lastModified: listedAt, changeFrequency: "daily", priority: 0.7 }];
}

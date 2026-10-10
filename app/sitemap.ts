import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { sitemapEntries } from "@/lib/seo";

/** Время сборки (next.config.ts → env.BUILD_TIME): контент статических страниц меняется только с деплоем. */
const BUILT_AT = new Date(process.env.BUILD_TIME ?? Date.now());

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // домен — из окружения сервера, а не сборки
  // Опубликованные страницы тренеров с включённым режимом тренера
  const coaches = await db.coachProfile.findMany({
    where: { publishedAt: { not: null }, user: { isCoach: true, nickname: { not: null } } },
    select: { updatedAt: true, user: { select: { nickname: true } } },
  });
  return sitemapEntries(
    env.APP_URL,
    BUILT_AT,
    coaches.map((c) => ({ nickname: c.user.nickname!, updatedAt: c.updatedAt })),
  );
}

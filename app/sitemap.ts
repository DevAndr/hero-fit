import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { absoluteUrl, PUBLIC_SITEMAP } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // домен — из окружения сервера, а не сборки
  // Опубликованные страницы тренеров с включённым режимом тренера
  const coaches = await db.coachProfile.findMany({
    where: { publishedAt: { not: null }, user: { isCoach: true, nickname: { not: null } } },
    select: { updatedAt: true, user: { select: { nickname: true } } },
  });
  return [
    ...PUBLIC_SITEMAP.map(({ path, priority, changeFrequency }) => ({
      url: absoluteUrl(env.APP_URL, path),
      lastModified: new Date(),
      changeFrequency,
      priority,
    })),
    ...coaches.map((c) => ({
      url: absoluteUrl(env.APP_URL, `/trainer/${encodeURIComponent(c.user.nickname!)}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

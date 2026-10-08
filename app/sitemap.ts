import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { absoluteUrl, PUBLIC_SITEMAP } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // домен — из окружения сервера, а не сборки
  return PUBLIC_SITEMAP.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(env.APP_URL, path),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}

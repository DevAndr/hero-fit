import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { absoluteUrl, PUBLIC_SITEMAP } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_SITEMAP.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(env.APP_URL, path),
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}

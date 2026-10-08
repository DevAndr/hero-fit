import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { absoluteUrl, isIndexable } from "@/lib/seo";

/** Вне production на публичном домене — запрет всего; иначе открыты лендинг и калькуляторы, кабинет и API — нет. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable(env.NODE_ENV, env.APP_URL)) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/tools/"],
      disallow: ["/api/", "/dashboard", "/training", "/workouts", "/exercises", "/templates", "/calendar", "/stats", "/achievements", "/friends", "/leaderboard", "/recap", "/settings", "/reset-password"],
    },
    sitemap: absoluteUrl(env.APP_URL, "/sitemap.xml"),
    host: new URL(env.APP_URL).origin,
  };
}

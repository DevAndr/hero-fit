import { db } from "@/lib/db";
import { isBot } from "@/lib/analytics/bots";
import { APK_FILE } from "@/lib/native/apk";

// Каждое нажатие «Скачать APK» — в счётчик дня; сам файл отдаёт Caddy (/apk/…, deploy/Caddyfile)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isBot(request.headers.get("user-agent"))) {
    await db.$executeRaw`
      INSERT INTO "ApkDownload" (day, count) VALUES (CURRENT_DATE, 1)
      ON CONFLICT (day) DO UPDATE SET count = "ApkDownload".count + 1`;
  }
  return new Response(null, { status: 302, headers: { Location: APK_FILE, "Cache-Control": "no-store" } });
}

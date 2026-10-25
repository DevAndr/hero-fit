import { env } from "@/lib/env";
import { assetLinks } from "@/lib/native/assetlinks";

// Отпечатки — из env на сервере, а не на сборке образа
export const dynamic = "force-dynamic";

/** App Links Android-приложения (android/README.md); публичный — proxy.ts, PUBLIC_PAGES. */
export function GET() {
  return Response.json(assetLinks(env.ANDROID_CERT_SHA256), { headers: { "Cache-Control": "public, max-age=3600" } });
}

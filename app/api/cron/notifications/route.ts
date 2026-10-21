import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runNotificationTick } from "@/lib/notifications/service";

/** Для внешнего планировщика (cron): Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Тестовые часы — только в e2e (E2E_TEST_CLOCK=1), в обычной работе ?now= игнорируется.
  const at = env.E2E_TEST_CLOCK === "1" ? req.nextUrl.searchParams.get("now") : null;
  // Тестовые часы передаём только явно: без них тик идёт по реальному времени (и с обычными ограничениями частоты).
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : undefined;
  return NextResponse.json(await runNotificationTick(now));
}

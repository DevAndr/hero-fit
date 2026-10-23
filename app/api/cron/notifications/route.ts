import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runNotificationTick, TICK_STEPS, type TickStep } from "@/lib/notifications/service";

/** Для внешнего планировщика (cron): Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Тестовые часы — только в e2e (E2E_TEST_CLOCK=1), в обычной работе ?now= игнорируется.
  const at = env.E2E_TEST_CLOCK === "1" ? req.nextUrl.searchParams.get("now") : null;
  // Тестовые часы передаём только явно: без них тик идёт по реальному времени (и с обычными ограничениями частоты).
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : undefined;
  // ?only=<шаг> — тоже только в e2e: тик одного шага не задевает чужие тесты и не идёт по всей базе
  const onlyParam = env.E2E_TEST_CLOCK === "1" ? req.nextUrl.searchParams.get("only") : null;
  const only = TICK_STEPS.find((s): s is TickStep => s === onlyParam);
  return NextResponse.json(await runNotificationTick(now, only));
}

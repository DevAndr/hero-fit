import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runNotificationTick } from "@/lib/notifications/service";

/** Для внешнего планировщика (cron): Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runNotificationTick());
}

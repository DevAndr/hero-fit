import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { isEnabled } from "@/lib/flags/server";
import { loadPartnerSnapshot } from "@/lib/together/snapshot";

const NO_STORE = { "Cache-Control": "no-store" };

/** Опрос совместной тренировки: срез партнёра, 👊 и события после since (раз в 5 с с экрана тренировки). */
export async function GET(req: NextRequest, { params }: RouteContext<"/api/together/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  if (!(await isEnabled("together", user.id))) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  const { id } = await params;
  const raw = req.nextUrl.searchParams.get("since");
  const since = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : null;
  const body = await loadPartnerSnapshot(id, user.id, since, new Date());
  if (!body) return NextResponse.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(body, { headers: NO_STORE });
}

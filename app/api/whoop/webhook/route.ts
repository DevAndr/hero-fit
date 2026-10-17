import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { whoopConfigured } from "@/lib/whoop/config";
import { verifyWhoopSignature } from "@/lib/whoop/signature";
import { removeOne, syncOne } from "@/lib/whoop/sync";

const noContent = () => new Response(null, { status: 204 });

/** Вебхук WHOOP: подписанное сырое тело → по `workout.updated`/`workout.deleted` обновляем активность в after(). */
export async function POST(req: Request) {
  if (!whoopConfigured() || !env.WHOOP_CLIENT_SECRET) return new Response(null, { status: 404 });
  const body = await req.text();
  const ok = verifyWhoopSignature({
    body,
    signature: req.headers.get("x-whoop-signature"),
    timestamp: req.headers.get("x-whoop-signature-timestamp"),
    secret: env.WHOOP_CLIENT_SECRET,
    now: Date.now(),
  });
  if (!ok) return new Response(null, { status: 401 });

  let event: { user_id?: unknown; id?: unknown; type?: unknown };
  try {
    event = JSON.parse(body);
  } catch {
    return noContent();
  }
  if (!event || typeof event !== "object") return noContent();
  const { user_id, id, type } = event;
  if ((typeof user_id !== "number" && typeof user_id !== "string") || typeof id !== "string" || typeof type !== "string") {
    return noContent();
  }
  if (type !== "workout.updated" && type !== "workout.deleted") return noContent();

  const whoopUserId = String(user_id);
  const conn = await db.whoopConnection.findUnique({ where: { whoopUserId }, select: { userId: true } });
  if (!conn) return noContent();

  after(async () => {
    try {
      if (type === "workout.updated") await syncOne(conn.userId, whoopUserId, id);
      else await removeOne(conn.userId, id);
    } catch (e) {
      // Только имя ошибки: message ошибки Prisma может содержать пульс/ккал (данные о здоровье)
      console.error("[whoop] webhook", type, (e as Error).name);
    }
  });
  return noContent();
}

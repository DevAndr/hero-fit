import { after } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { whoopConfigured } from "@/lib/whoop/config";
import { verifyWhoopSignature } from "@/lib/whoop/signature";
import { clearRecovery, removeSleep, syncRecoveryOne, syncSleepOne } from "@/lib/whoop/sleep-sync";
import { removeOne, syncOne } from "@/lib/whoop/sync";

const HANDLED = new Set(["workout.updated", "workout.deleted", "sleep.updated", "sleep.deleted", "recovery.updated", "recovery.deleted"]);

const noContent = () => new Response(null, { status: 204 });

/** Вебхук WHOOP: подписанное сырое тело → по `workout.*` обновляем активность, по `sleep.*`/`recovery.*` — сон и восстановление в after(). */
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
  if (!HANDLED.has(type)) return noContent();

  const whoopUserId = String(user_id);
  const conn = await db.whoopConnection.findUnique({ where: { whoopUserId }, select: { userId: true } });
  if (!conn) return noContent();

  after(async () => {
    try {
      if (type === "workout.updated") await syncOne(conn.userId, whoopUserId, id);
      else if (type === "workout.deleted") await removeOne(conn.userId, id);
      else if (type === "sleep.updated") await syncSleepOne(conn.userId, whoopUserId, id);
      else if (type === "sleep.deleted") await removeSleep(conn.userId, id);
      else if (type === "recovery.updated") await syncRecoveryOne(conn.userId, whoopUserId, id);
      else await clearRecovery(conn.userId, id);
    } catch (e) {
      // Только имя ошибки: message ошибки Prisma может содержать пульс/ккал (данные о здоровье)
      console.error("[whoop] webhook", type, (e as Error).name);
    }
  });
  return noContent();
}

import { env } from "@/lib/env";
import { webhookStatus } from "@/lib/telegram/format";
import { handleUpdate } from "@/lib/telegram/updates";

/** Webhook Telegram-бота. После проверки секрета всегда 200 — иначе Telegram повторяет обновление. */
export async function POST(req: Request) {
  const status = webhookStatus(env, req.headers.get("x-telegram-bot-api-secret-token"));
  if (status !== 200) return new Response(null, { status });
  try {
    await handleUpdate(await req.json().catch(() => null));
  } catch (e) {
    console.error("[telegram] update failed", (e as Error).message);
  }
  return Response.json({ ok: true });
}

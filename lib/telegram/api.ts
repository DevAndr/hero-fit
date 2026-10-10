import "server-only";
import { env } from "@/lib/env";

export type BotResult<T> = { ok: true; result: T } | { ok: false; status: number; description: string };

/**
 * Вызов Bot API без библиотек. Никогда не бросает: сеть и таймаут (10 с — зависший Telegram не держит очередь)
 * возвращаются как { ok: false, status: 0 }.
 */
export async function callBot<T = unknown>(method: string, params: object, { timeoutMs = 10_000 } = {}): Promise<BotResult<T>> {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, status: 0, description: "telegram disabled" };
  try {
    const res = await fetch(`${env.TELEGRAM_API_URL}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
    if (res.ok && data?.ok) return { ok: true, result: data.result as T };
    return { ok: false, status: res.status, description: data?.description ?? res.statusText };
  } catch (e) {
    return { ok: false, status: 0, description: (e as Error).message };
  }
}

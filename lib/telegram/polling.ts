import "server-only";
import { env } from "@/lib/env";
import { callBot } from "@/lib/telegram/api";
import { telegramEnabled } from "@/lib/telegram/format";
import { handleUpdate } from "@/lib/telegram/updates";

const globalForPolling = globalThis as unknown as { heroFitTelegramPolling?: boolean };

/**
 * Локальная разработка без публичного адреса (TELEGRAM_POLLING=on): обновления через long polling getUpdates
 * вместо webhook. Webhook снимается — Telegram не отдаёт getUpdates, пока он задан.
 */
export function startTelegramPolling() {
  if (env.TELEGRAM_POLLING !== "on" || !telegramEnabled(env) || globalForPolling.heroFitTelegramPolling) return;
  globalForPolling.heroFitTelegramPolling = true;
  void (async () => {
    await callBot("deleteWebhook", {});
    let offset = 0;
    for (;;) {
      const res = await callBot<{ update_id: number }[]>("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] }, { timeoutMs: 35_000 });
      if (!res.ok) {
        console.error("[telegram] getUpdates failed", res.status, res.description);
        await new Promise((r) => setTimeout(r, 5_000));
        continue;
      }
      for (const update of res.result) {
        offset = update.update_id + 1;
        await handleUpdate(update).catch((e) => console.error("[telegram] update failed", (e as Error).message));
      }
    }
  })();
}

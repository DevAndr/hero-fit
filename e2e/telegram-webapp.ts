import type { Page } from "@playwright/test";
import { signInitData } from "../lib/telegram/init-data";

/** Токен бота e2e-сервера (playwright.config.ts) — им подписан initData заглушки. */
export const E2E_BOT_TOKEN = "e2e-token";

export function e2eInitData({ id, firstName, startParam }: { id: string; firstName: string; startParam?: string }) {
  return signInitData(
    {
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: "e2e",
      user: JSON.stringify({ id: Number(id), first_name: firstName, username: `u${id}` }),
      ...(startParam ? { start_param: startParam } : {}),
    },
    E2E_BOT_TOKEN,
  );
}

/**
 * Подменяет telegram-web-app.js: window.Telegram.WebApp с initData, подписанным e2e-токеном.
 * Без опций — пустой скрипт (как /tg в обычном браузере); tamper — испорченная подпись.
 */
export async function mockTelegram(page: Page, opts?: { id: string; firstName: string; startParam?: string; tamper?: boolean }) {
  let initData = opts ? e2eInitData(opts) : "";
  if (opts?.tamper) initData = initData.replace(/hash=[0-9a-f]{4}/, "hash=0000");
  const body = opts
    ? `window.Telegram = { WebApp: { initData: ${JSON.stringify(initData)}, ready() {}, expand() {}, requestWriteAccess(cb) { cb && cb(true); } } };`
    : "";
  await page.route("https://telegram.org/js/telegram-web-app.js*", (route) =>
    route.fulfill({ contentType: "application/javascript", body }),
  );
}

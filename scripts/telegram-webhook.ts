/**
 * Регистрация webhook Telegram-бота: npm run telegram:webhook (env — из .env или окружения).
 * Без lib/* — те модули server-only. На сервере без tsx — тот же запрос через curl (deploy/README.md).
 */
import "dotenv/config";

const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: username, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL } = process.env;
const api = process.env.TELEGRAM_API_URL || "https://api.telegram.org";

async function main() {
  if (!token || !username) {
    console.log("Telegram-интеграция выключена (нет TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME) — webhook не нужен");
    return;
  }
  if (!secret || secret.length < 32) throw new Error("TELEGRAM_WEBHOOK_SECRET обязателен (32+ символа)");
  if (!APP_URL?.startsWith("https://")) throw new Error(`Webhook нужен публичный https APP_URL, сейчас: ${APP_URL ?? "—"}`);

  const url = new URL("/api/telegram/webhook", APP_URL).toString();
  const res = await fetch(`${api}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  console.log(`setWebhook ${url}:`, data);
  if (!data.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});

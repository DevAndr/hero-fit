import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NOTIFICATIONS_WORKER === "off") return;
  const { startNotificationWorker } = await import("./lib/notifications/worker");
  startNotificationWorker();
  const { startTelegramPolling } = await import("./lib/telegram/polling");
  startTelegramPolling();
}

/**
 * Ошибки сервера (страницы, server actions, route handlers, proxy) — в журнал `/admin/errors`. Не ждём записи:
 * Next держит ответ 500 до конца `onRequestError`, а при тормозящей базе это удлинило бы сбой.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportServerError } = await import("./lib/errors/report");
  void reportServerError(err, request).catch((e) => console.error("[errors] report failed", e));
};

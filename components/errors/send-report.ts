import { isNoise } from "@/lib/errors/noise";

/** За жизнь страницы — не больше 10 отчётов и одно сообщение один раз (защита от циклов рендера). */
const MAX_REPORTS = 10;
const sent = new Set<string>();

/** «TypeError: x» — как на сервере; у обычного Error — только текст. */
export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error.message;
  return String(error);
}

/** Отчёт об ошибке браузера в /api/errors: sendBeacon (уйдёт и при закрытии вкладки), без него — fetch keepalive. */
export function sendErrorReport(error: unknown) {
  // С digest — ошибка сервера (упавший server action, рендер), её уже записал onRequestError
  if (typeof error === "object" && error !== null && "digest" in error && error.digest) return;
  const message = errorMessage(error).slice(0, 1000);
  const stack = error instanceof Error && error.stack ? error.stack.slice(0, 6000) : undefined;
  if (!message || isNoise({ message, stack: stack ?? null })) return;
  if (sent.size >= MAX_REPORTS || sent.has(message)) return;
  sent.add(message);
  const body = JSON.stringify({ message, stack, path: location.pathname.slice(0, 300), version: process.env.APP_VERSION });
  try {
    if (navigator.sendBeacon?.("/api/errors", body)) return;
  } catch {
    // ниже — запасной путь
  }
  void fetch("/api/errors", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

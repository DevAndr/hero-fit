const BASE = "http://internal.invalid";

/**
 * Редирект после входа/регистрации — только на внутренние пути. Управляющие символы и «\» отклоняются
 * сразу (браузер вырезает табуляцию и переводы строк: «/\t/evil.com» стал бы «//evil.com»), затем путь
 * разбирается как URL и должен остаться на своём origin.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE || value.startsWith("//")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

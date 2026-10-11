import "server-only";
import { db } from "@/lib/db";
import { afterFailure, LIMITS, lockedFor } from "@/lib/auth/throttle-rules";

/**
 * Ключи попытки входа: по введённому логину/email и по IP. IP — из X-Real-IP, его ставит только Caddy
 * (header_up, клиентский перезаписывается); X-Forwarded-For не годится — Next подставляет его сам из сокета,
 * и без прокси (e2e, локально) все запросы оказались бы «с одного IP».
 */
export function throttleKeys(identifier: string, realIp: string | null) {
  const ip = realIp?.trim();
  return [
    { key: `id:${identifier.trim().toLowerCase()}`, limit: LIMITS.id },
    ...(ip ? [{ key: `ip:${ip}`, limit: LIMITS.ip }] : []),
  ];
}

type Keys = ReturnType<typeof throttleKeys>;

/** Сколько мс ещё действует блокировка (0 — можно проверять пароль). */
export async function throttleLock(keys: Keys, now = new Date()) {
  const rows = await db.loginThrottle.findMany({ where: { key: { in: keys.map((k) => k.key) } } });
  return Math.max(0, ...rows.map((r) => lockedFor(r, now)));
}

export async function recordLoginFailure(keys: Keys, now = new Date()) {
  for (const { key, limit } of keys) {
    const current = await db.loginThrottle.findUnique({ where: { key } });
    const next = afterFailure(current, now, limit);
    await db.loginThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
  }
}

/** Успешный вход сбрасывает счётчик логина; счётчик IP — нет (иначе подбор шёл бы вперемешку со своим входом). */
export async function recordLoginSuccess(keys: Keys) {
  await db.loginThrottle.deleteMany({ where: { key: { in: keys.filter((k) => k.key.startsWith("id:")).map((k) => k.key) } } });
}

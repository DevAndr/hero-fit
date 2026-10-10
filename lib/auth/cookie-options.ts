/**
 * Атрибуты cookies сессии. Сессия из Telegram Mini App (embedded) живёт и во фрейме web.telegram.org:
 * SameSite=None + Partitioned (CHIPS) — cookie в отдельном хранилище «сайт внутри Telegram», обычный сайт её не видит.
 */
export function authCookieOptions({ embedded, production, maxAge }: { embedded: boolean; production: boolean; maxAge: number }) {
  const base = { httpOnly: true, path: "/", maxAge };
  return embedded
    ? { ...base, sameSite: "none" as const, secure: true, partitioned: true }
    : { ...base, sameSite: "lax" as const, secure: production };
}

export type AuthCookieOptions = ReturnType<typeof authCookieOptions>;

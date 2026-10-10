import "server-only";
import { env } from "@/lib/env";
import { authCookieOptions, type AuthCookieOptions } from "@/lib/auth/cookie-options";
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from "@/lib/auth/tokens";

export const ACCESS_COOKIE = "hf_at";
export const REFRESH_COOKIE = "hf_rt";

const production = env.NODE_ENV === "production";

export type IssuedTokens = { accessToken: string; refreshToken: string };

/** Подходит и для `cookies()` из next/headers, и для `NextResponse.cookies`. */
type CookieWriter = {
  set(name: string, value: string, options: AuthCookieOptions): unknown;
};

/** embedded — сессия из Telegram Mini App: cookies для фрейма (SameSite=None; Partitioned). */
export function writeAuthCookies(store: CookieWriter, tokens: Partial<IssuedTokens>, { embedded = false } = {}) {
  if (tokens.accessToken) store.set(ACCESS_COOKIE, tokens.accessToken, authCookieOptions({ embedded, production, maxAge: ACCESS_TTL_SEC }));
  if (tokens.refreshToken) store.set(REFRESH_COOKIE, tokens.refreshToken, authCookieOptions({ embedded, production, maxAge: REFRESH_TTL_SEC }));
}

/**
 * Partitioned-cookie (сессия Mini App) удаляется только Set-Cookie с теми же атрибутами — обычный delete её не
 * трогает (выход в Telegram зацикливал бы /login ⇄ /dashboard).
 */
export function clearAuthCookies(store: CookieWriter & { delete(name: string): unknown }, { embedded = false } = {}) {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
    if (embedded) store.set(name, "", authCookieOptions({ embedded, production, maxAge: 0 }));
    else store.delete(name);
  }
}

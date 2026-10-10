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

export function clearAuthCookies(store: { delete(name: string): unknown }) {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

import "server-only";
import { env } from "@/lib/env";
import { ACCESS_TTL_SEC, REFRESH_TTL_SEC } from "@/lib/auth/tokens";

export const ACCESS_COOKIE = "hf_at";
export const REFRESH_COOKIE = "hf_rt";

const base = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const accessCookieOptions = { ...base, maxAge: ACCESS_TTL_SEC };
export const refreshCookieOptions = { ...base, maxAge: REFRESH_TTL_SEC };

export type IssuedTokens = { accessToken: string; refreshToken: string };

/** Подходит и для `cookies()` из next/headers, и для `NextResponse.cookies`. */
type CookieWriter = {
  set(name: string, value: string, options: typeof base & { maxAge: number }): unknown;
};

export function writeAuthCookies(store: CookieWriter, tokens: Partial<IssuedTokens>) {
  if (tokens.accessToken) store.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions);
  if (tokens.refreshToken) store.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions);
}

export function clearAuthCookies(store: { delete(name: string): unknown }) {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

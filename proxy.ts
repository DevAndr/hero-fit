import { NextResponse, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  REFRESH_COOKIE,
  writeAuthCookies,
  type IssuedTokens,
} from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/session";
import { verifyAccessToken } from "@/lib/auth/tokens";

const AUTH_PAGES = ["/login", "/register", "/forgot-password"];
const PUBLIC_PAGES = ["/", "/privacy", "/reset-password", "/tools/1rm", "/tools/plates", ...AUTH_PAGES];
/** Публичные файлы без расширения (PWA-иконки, картинка для соцсетей — opengraph-image?<hash>) и страницы тренеров /trainer/<ник>. */
const PUBLIC_PREFIXES = ["/pwa-icon/", "/opengraph-image", "/trainer/"];

/**
 * Оптимистичная проверка по cookie + тихий refresh, когда access истёк.
 * Окончательная проверка сессии (blacklist) — в lib/auth/dal.ts.
 */
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  let authed = Boolean(await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value));
  let refreshed: Partial<IssuedTokens> | null = null;
  let staleRefresh = false;

  if (!authed && req.cookies.has(REFRESH_COOKIE)) {
    const result = await rotateRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);
    if (result.ok) {
      authed = true;
      refreshed = result.tokens;
    } else {
      staleRefresh = true;
    }
  }

  const response = route();

  if (refreshed) writeAuthCookies(response.cookies, refreshed);
  if (staleRefresh) clearAuthCookies(response.cookies);
  return response;

  function route() {
    if (pathname.startsWith("/api/")) {
      // API сам проверяет доступ через DAL и отвечает 401 — без редиректов.
      return passThrough();
    }

    if (!authed && !PUBLIC_PAGES.includes(pathname) && !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      const url = new URL("/login", req.nextUrl);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }

    if (authed && AUTH_PAGES.includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }

    return passThrough();
  }

  /** Новые токены кладём и в текущий запрос — Server Components увидят их сразу. */
  function passThrough() {
    if (refreshed) {
      if (refreshed.accessToken) req.cookies.set(ACCESS_COOKIE, refreshed.accessToken);
      if (refreshed.refreshToken) req.cookies.set(REFRESH_COOKIE, refreshed.refreshToken);
    }
    if (staleRefresh) {
      req.cookies.delete(ACCESS_COOKIE);
      req.cookies.delete(REFRESH_COOKIE);
    }
    return NextResponse.next({ request: { headers: req.headers } });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"],
};

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
import { encodeSource, landingOf, landingOfJoin, referrerOf, SOURCE_COOKIE, SOURCE_MAX_AGE, type Landing } from "@/lib/analytics/source";

const AUTH_PAGES = ["/login", "/register", "/forgot-password"];
const PUBLIC_PAGES = ["/", "/privacy", "/changelog", "/reset-password", "/tools/1rm", "/tools/plates", "/tools/dots-wilks", "/training-programs", "/tg", ...AUTH_PAGES];
/** Публичные файлы без расширения (PWA-иконки, картинка для соцсетей — opengraph-image?<hash>), страницы тренеров /trainer/<ник> и залов /gym/<город>/<зал>. */
const PUBLIC_PREFIXES = ["/pwa-icon/", "/opengraph-image", "/trainer/", "/gym/", "/training-programs/"];
/** Страничные префиксы (не файлы): только их посещения считаются первой точкой входа. */
const PAGE_PREFIXES = ["/trainer/", "/gym/", "/training-programs/"];

/**
 * Оптимистичная проверка по cookie + тихий refresh, когда access истёк.
 * Окончательная проверка сессии (blacklist) — в lib/auth/dal.ts.
 */
export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  let authed = Boolean(await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value));
  let refreshed: Partial<IssuedTokens> | null = null;
  let embedded = false;
  let staleRefresh = false;

  if (!authed && req.cookies.has(REFRESH_COOKIE)) {
    const result = await rotateRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);
    if (result.ok) {
      authed = true;
      refreshed = result.tokens;
      embedded = result.embedded;
    } else {
      staleRefresh = true;
      embedded = result.embedded;
    }
  }

  const response = route();

  // Сессия из Mini App сохраняет атрибуты для фрейма web.telegram.org
  if (refreshed) writeAuthCookies(response.cookies, refreshed, { embedded });
  if (staleRefresh) clearAuthCookies(response.cookies, { embedded });
  return response;

  function route() {
    if (pathname.startsWith("/api/")) {
      // API сам проверяет доступ через DAL и отвечает 401 — без редиректов.
      return passThrough();
    }

    if (!authed && !PUBLIC_PAGES.includes(pathname) && !PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
      const url = new URL("/login", req.nextUrl);
      url.searchParams.set("next", pathname + search);
      const redirect = NextResponse.redirect(url);
      // Ссылка-приглашение — тоже первая точка входа (иначе на /login поставится other)
      const joinLanding = landingOfJoin(pathname);
      if (joinLanding && canTagSource()) setSource(redirect, joinLanding);
      return redirect;
    }

    if (authed && AUTH_PAGES.includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }

    const response = passThrough();
    if (shouldTagSource()) setSource(response, landingOf(pathname));
    return response;
  }

  function setSource(res: NextResponse, landing: Landing) {
    res.cookies.set(
      SOURCE_COOKIE,
      encodeSource({ landing, referrer: referrerOf(req.headers.get("referer"), req.nextUrl.host) }),
      { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SOURCE_MAX_AGE },
    );
  }

  /** Гость, GET документа (не RSC-навигация), cookie ещё нет. */
  function canTagSource() {
    return req.method === "GET" && !authed && !req.headers.has("rsc") && !req.cookies.has(SOURCE_COOKIE);
  }

  /** Первая точка входа: canTagSource + публичная страница (не файлы вроде /pwa-icon/ и /opengraph-image). */
  function shouldTagSource() {
    return canTagSource() && (PUBLIC_PAGES.includes(pathname) || PAGE_PREFIXES.some((p) => pathname.startsWith(p)));
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

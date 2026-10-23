import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  clearAuthCookies,
  REFRESH_COOKIE,
  writeAuthCookies,
  type IssuedTokens,
} from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/session";
import { verifyAccessToken } from "@/lib/auth/tokens";
import {
  encodeSource,
  encodeUtm,
  landingOf,
  landingOfJoin,
  referrerOf,
  SOURCE_COOKIE,
  SOURCE_MAX_AGE,
  UTM_COOKIE,
  utmOf,
  type Landing,
} from "@/lib/analytics/source";
import { isBot } from "@/lib/analytics/bots";
import { recordFirstVisit, recordUtmVisit } from "@/lib/analytics/visits";

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
export default async function proxy(req: NextRequest, event: NextFetchEvent) {
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
      if (joinLanding) tagSource(redirect, joinLanding);
      return redirect;
    }

    if (authed && AUTH_PAGES.includes(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
    }

    const response = passThrough();
    if (PUBLIC_PAGES.includes(pathname) || PAGE_PREFIXES.some((p) => pathname.startsWith(p))) tagSource(response, landingOf(pathname));
    return response;
  }

  /**
   * Гость, GET документа (не RSC-навигация): первая точка входа — если cookie ещё нет; рекламная метка — каждый
   * переход с ней (последний до регистрации). Только публичные страницы, не файлы вроде /pwa-icon/ и /opengraph-image.
   */
  function tagSource(res: NextResponse, landing: Landing) {
    // Заголовок rsc до proxy доходит не всегда (у prefetch Next.js его срезает): фоновый запрос браузера — Sec-Fetch-Dest
    // не «document» (и не «iframe» — Mini App в веб-Telegram), запрос роутера — с next-url
    const dest = req.headers.get("sec-fetch-dest");
    const background = req.headers.has("rsc") || req.headers.has("next-url") || (dest !== null && dest !== "document" && dest !== "iframe");
    if (req.method !== "GET" || authed || background) return;
    const opts = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SOURCE_MAX_AGE } as const;
    // Счётчики заходов для админки — фоном, ответ БД не ждёт; ботам cookie ставим, но не считаем
    const counted = !isBot(req.headers.get("user-agent"));
    if (!req.cookies.has(SOURCE_COOKIE)) {
      const referrer = referrerOf(req.headers.get("referer"), req.nextUrl.host);
      res.cookies.set(SOURCE_COOKIE, encodeSource({ landing, referrer }), opts);
      if (counted) event.waitUntil(recordFirstVisit(landing, referrer));
    }
    const utm = utmOf(req.nextUrl.searchParams);
    if (utm) {
      res.cookies.set(UTM_COOKIE, encodeUtm(utm), opts);
      if (counted) event.waitUntil(recordUtmVisit(utm));
    }
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

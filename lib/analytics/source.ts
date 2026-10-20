/** Первая точка входа: классификация страницы и источника перехода. Чистые функции, без server-only (их импортирует proxy). */

export type Landing = "home" | "program" | "tool" | "trainer" | "club" | "other";
export type Referrer = "search" | "social" | "direct" | "site";

export const SOURCE_COOKIE = "hf_src";
export const SOURCE_MAX_AGE = 60 * 60 * 24 * 30;

const LANDINGS: readonly Landing[] = ["home", "program", "tool", "trainer", "club", "other"];
const REFERRERS: readonly Referrer[] = ["search", "social", "direct", "site"];

const SEARCH_DOMAINS = ["yandex.ru", "ya.ru", "yandex.com", "bing.com", "duckduckgo.com", "go.mail.ru", "search.brave.com"];
const SOCIAL_DOMAINS = [
  "vk.com",
  "vk.ru",
  "t.me",
  "telegram.org",
  "youtube.com",
  "dzen.ru",
  "ok.ru",
  "instagram.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "pikabu.ru",
];

export function landingOf(pathname: string): Landing {
  if (pathname === "/") return "home";
  if (pathname === "/training-programs" || pathname.startsWith("/training-programs/")) return "program";
  if (pathname.startsWith("/tools/")) return "tool";
  if (pathname.startsWith("/trainer/")) return "trainer";
  if (pathname.startsWith("/gym/")) return "club";
  return "other";
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
}

function matches(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function referrerOf(referer: string | null, ownHost: string): Referrer {
  if (!referer) return "direct";
  let host: string;
  try {
    host = bareHost(new URL(referer).host);
  } catch {
    return "direct";
  }
  if (!host || host === bareHost(ownHost)) return "direct";
  if (matches(host, SEARCH_DOMAINS) || host.split(".").includes("google")) return "search";
  if (matches(host, SOCIAL_DOMAINS)) return "social";
  return "site";
}

export function encodeSource(s: { landing: Landing; referrer: Referrer }): string {
  return `${s.landing}.${s.referrer}`;
}

export function decodeSource(raw: string | undefined): { landing: Landing; referrer: Referrer } | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [landing, referrer] = parts;
  if (!LANDINGS.includes(landing as Landing) || !REFERRERS.includes(referrer as Referrer)) return null;
  return { landing: landing as Landing, referrer: referrer as Referrer };
}

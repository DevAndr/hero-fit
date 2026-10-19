/** SEO: тексты сайта, адреса и правило индексации. Без server-only — чистые функции тестируются отдельно. */

import { BUILTIN_PROGRAMS, type BuiltinProgram } from "@/lib/programs/builtin";

export const SITE_NAME = "Hero Fit";
export const SITE_TITLE = "Hero Fit — дневник тренировок в игровом стиле";
export const SITE_DESCRIPTION =
  "Бесплатный дневник тренировок для зала: уровни и XP за каждый подход, недельный streak, ачивки, личные рекорды, таймер отдыха и графики прогресса. Работает в браузере и офлайн.";
export const SITE_KEYWORDS = [
  "дневник тренировок",
  "приложение для тренировок",
  "трекер тренировок",
  "тренировки в зале",
  "журнал тренировок онлайн",
  "программа тренировок",
  "калькулятор 1ПМ",
  "калькулятор блинов",
  "личные рекорды",
  "мотивация к тренировкам",
];

/** Индексировать только production на публичном домене — превью и локальные сборки закрыты noindex. */
export function isIndexable(nodeEnv: string | undefined, appUrl: string): boolean {
  if (nodeEnv !== "production") return false;
  const host = new URL(appUrl).hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0";
}

export function absoluteUrl(origin: string, path: string): string {
  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

/** JSON-LD для <script type="application/ld+json">: «<» экранируется, чтобы строка не закрыла тег. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Публичные страницы для поисковиков: лендинг, калькуляторы и регистрация. */
export const PUBLIC_SITEMAP: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/tools/1rm", priority: 0.8, changeFrequency: "monthly" },
  { path: "/tools/plates", priority: 0.8, changeFrequency: "monthly" },
  { path: "/training-programs", priority: 0.8, changeFrequency: "monthly" },
  ...BUILTIN_PROGRAMS.map((p) => ({ path: `/training-programs/${p.slug}`, priority: 0.8, changeFrequency: "monthly" as const })),
  { path: "/register", priority: 0.5, changeFrequency: "monthly" },
  { path: "/changelog", priority: 0.5, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "monthly" },
];

/**
 * Записи sitemap.xml. lastmod — настоящая дата изменения: статические страницы меняются только с деплоем (дата
 * сборки), страница тренера — по своему updatedAt. «Сейчас» на каждый запрос поисковики считают недостоверным.
 */
export function sitemapEntries(
  origin: string,
  builtAt: Date,
  coaches: { nickname: string; updatedAt: Date }[],
  clubs: { path: string; updatedAt: Date }[] = [],
  cities: { path: string; updatedAt: Date }[] = [],
) {
  return [
    ...PUBLIC_SITEMAP.map(({ path, priority, changeFrequency }) => ({ url: absoluteUrl(origin, path), lastModified: builtAt, changeFrequency, priority })),
    ...coaches.map((c) => ({
      url: absoluteUrl(origin, `/trainer/${encodeURIComponent(c.nickname)}`),
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...clubs.map((c) => ({ url: absoluteUrl(origin, c.path), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...cities.map((c) => ({ url: absoluteUrl(origin, c.path), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}

/** Структурированные данные страницы-инструмента: хлебные крошки, веб-приложение и FAQ. */
export function toolJsonLd(
  origin: string,
  tool: { path: string; name: string; description: string; crumbs: { href: string; label: string }[]; faq: { q: string; a: string }[] },
) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: tool.crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: absoluteUrl(origin, c.href) })),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: tool.name,
      url: absoluteUrl(origin, tool.path),
      description: tool.description,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      inLanguage: "ru-RU",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: tool.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}

/** Структурированные данные страницы программы: хлебные крошки, план тренировок и FAQ. */
export function programJsonLd(origin: string, p: BuiltinProgram): object[] {
  const crumbs = [
    { href: "/", label: "Hero Fit" },
    { href: "/training-programs", label: "Программы тренировок" },
    { href: `/training-programs/${p.slug}`, label: p.title },
  ];
  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: absoluteUrl(origin, c.href) })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ExercisePlan",
      name: p.title,
      description: p.description,
      url: absoluteUrl(origin, `/training-programs/${p.slug}`),
      activityFrequency: p.perWeek,
      exerciseType: "Силовые тренировки",
      inLanguage: "ru-RU",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];
}

/** Описание публичной страницы (тренер, клуб) для поисковиков: начало текста до 160 символов по слову, в одну строку. */
export function shortDescription(about: string, max = 160): string {
  const text = about.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/** JSON-LD публичной страницы тренера: Person с городом и специализациями. */
export function coachJsonLd(c: { name: string; url: string; city: string | null; specialties: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: c.name,
    jobTitle: "Тренер",
    url: c.url,
    ...(c.city ? { address: { "@type": "PostalAddress", addressLocality: c.city } } : {}),
    ...(c.specialties.length ? { knowsAbout: c.specialties } : {}),
  };
}

/** JSON-LD публичной страницы клуба: ExerciseGym с почтовым адресом. */
export function clubJsonLd(c: { name: string; url: string; city: string; address: string; description: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    name: c.name,
    url: c.url,
    address: { "@type": "PostalAddress", addressLocality: c.city, streetAddress: c.address, addressCountry: "RU" },
    ...(c.description ? { description: c.description } : {}),
  };
}

/** JSON-LD страницы города: список клубов. */
export function cityJsonLd(c: { city: string; urls: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Тренажёрные залы — ${c.city}`,
    itemListElement: c.urls.map((url, i) => ({ "@type": "ListItem", position: i + 1, url })),
  };
}

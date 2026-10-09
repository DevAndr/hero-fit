/** SEO: тексты сайта, адреса и правило индексации. Без server-only — чистые функции тестируются отдельно. */

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
  { path: "/register", priority: 0.5, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "monthly" },
];

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

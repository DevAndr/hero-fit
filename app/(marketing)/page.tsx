import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ArrowRight, BellRing, CalendarDays, Check, Crown, Gift, MessageCircleQuestion, Sparkles, Users } from "lucide-react";
import { Faq, faqFor } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/v2/hero";
import { How } from "@/components/marketing/v2/how";
import { Bento, FEATURE_LIST } from "@/components/marketing/v2/bento";
import { Game } from "@/components/marketing/v2/game";
import { Together } from "@/components/marketing/v2/together";
import { Coaches } from "@/components/marketing/v2/coaches";
import { Compare } from "@/components/marketing/v2/compare";
import { Platforms } from "@/components/marketing/v2/platforms";
import { GradientText, Section, glass } from "@/components/marketing/v2/section";
import { StickyCta } from "@/components/marketing/v2/sticky-cta";
import { cn } from "@/lib/utils";
import { WhatsNewLink } from "@/components/marketing/whats-new-link";
import { CountUp, Reveal } from "@/components/marketing/motion";
import { buttonVariants } from "@/components/ui/button";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { getPopularCities } from "@/lib/club/public-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { showCatalogOnLanding } from "@/lib/coach/catalog";
import { catalogCount } from "@/lib/coach/catalog-queries";
import { isEnabled } from "@/lib/flags/server";
import { absoluteUrl, jsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramAppUrl } from "@/lib/telegram/links";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};


/** Бесплатно навсегда. Утверждения держать в соответствии с приложением. */
const FREE_PLAN = [
  "Тренировки без ограничений, шаблоны и готовые программы",
  "Своя база упражнений, таймер отдыха, калькуляторы",
  "Работа без интернета и push-уведомления",
  "Уровни, XP, ачивки, недельный streak и сундуки",
  "Босс недели, бестиарий и титулы",
  "Гильдии до 10 человек и рейд-босс недели",
  "Клубы залов: рейтинг и общие задания",
  "Друзья, лента и недельная лига",
  "Рекорды, подсказки прогрессии и основная статистика",
];

/** Станет платным после запуска Премиума — только то, что уже есть в приложении. */
const PREMIUM_PLAN = [
  "Тренды по неделям и расширенная статистика",
  "Архив итогов недели",
  "Баланс мышц за 30 дней",
  "Тренировка «по восстановлению» одним касанием",
  "Новые функции — первыми",
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const deleted = (await searchParams).deleted === "1";
  await connection();
  // Mini App в Telegram — только при настроенном боте
  const telegramUrl = telegramEnabled(env) ? telegramAppUrl(env.TELEGRAM_BOT_USERNAME) : null;
  // Клубы — только когда открыты всем (флаг `clubs` на 100 %): раздел, строка тарифа, вопросы FAQ.
  // Android-приложение — так же: флаг `native_app` для всех (иначе скачавший не сможет включить уведомления)
  const [exercises, programs, clubs, android, cities, authed, catalogCoaches] = await Promise.all([
    db.exercise.count({ where: { userId: null } }),
    db.workoutTemplate.count({ where: { userId: null } }),
    isEnabled("clubs", null),
    isEnabled("native_app", null),
    getPopularCities(6),
    cookies().then((c) => c.has(ACCESS_COOKIE)),
    catalogCount(),
  ]);
  const freePlan = FREE_PLAN.filter((t) => clubs || !t.startsWith("Клубы залов"));
  const faq = faqFor(clubs, android);
  const site = env.APP_URL;
  const structured = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: absoluteUrl(site, "/"),
      inLanguage: "ru-RU",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: absoluteUrl(site, "/"),
      description: SITE_DESCRIPTION,
      applicationCategory: "HealthApplication",
      applicationSubCategory: "Дневник тренировок",
      operatingSystem: "Web, Android, iOS",
      inLanguage: "ru-RU",
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
      featureList: FEATURE_LIST,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ];

  const stats: { value: number; from?: number; suffix?: string; label: string }[] = [
    { value: exercises, label: "упражнений в базе" },
    { value: programs, label: "готовых программ" },
    { value: 11, label: "групп мышц" },
    { value: 0, from: 990, suffix: " ₽", label: "ранний доступ: всё бесплатно" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <Hero
        notice={
          deleted ? (
            <p role="status" className="rounded-lg border bg-card/80 px-4 py-3 text-sm">
              Аккаунт удалён. Спасибо, что тренировались с Hero Fit
            </p>
          ) : null
        }
        whatsNew={<WhatsNewLink />}
        android={android}
        telegramUrl={telegramUrl}
      />

      {/* Цифры — настоящие, из базы */}
      <section aria-label="Hero Fit в цифрах" className="px-4">
        <dl className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/10 sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className="bg-card/80 px-4 py-7 text-center backdrop-blur">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-display text-3xl font-black text-primary tabular-nums sm:text-4xl">
                <span className="sr-only">
                  {s.value}
                  {s.suffix}
                </span>
                <span aria-hidden>
                  <CountUp value={s.value} from={s.from} suffix={s.suffix} delay={i * 0.12} />
                </span>
              </dd>
              <dd className="mt-1 text-sm text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <How />

      <Bento />

      <Game />

      <Together clubs={clubs} authed={authed} cities={cities} />

      <Coaches showFind={showCatalogOnLanding(catalogCoaches)} />

      <Compare />

      <Platforms android={android} telegramUrl={telegramUrl} />

      <Section
        id="pricing"
        eyebrow={<><Gift className="size-3.5" /> Тарифы</>}
        title="Сейчас всё бесплатно"
        lead="Идёт ранний доступ — открыты все функции. Позже появится Премиум, а основное останется бесплатным навсегда."
        center
      >
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
          <Reveal className={cn(glass, "flex flex-col p-6")}>
            <h3 className="text-lg font-bold">Бесплатно</h3>
            <p className="mt-1 text-sm text-muted-foreground">Навсегда</p>
            <ul className="mt-5 space-y-3 text-sm">
              {freePlan.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal
            delay={0.08}
            className="relative flex flex-col rounded-2xl border border-primary/50 bg-linear-to-b from-primary/10 to-card/70 p-6 shadow-[0_30px_80px_-40px_var(--primary)] backdrop-blur-md"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <Crown className="size-5 text-primary" aria-hidden /> Премиум
              </h3>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Скоро</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Всё из бесплатного, плюс</p>
            <ul className="mt-5 space-y-3 text-sm">
              {PREMIUM_PLAN.map((t) => (
                <li key={t} className="flex gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex gap-3 rounded-xl bg-primary/10 p-4 text-sm">
              <Gift className="size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-semibold">Год Премиума в подарок.</span> Всем, кто зарегистрируется до запуска Премиума, — 12 месяцев бесплатно с
                момента запуска. А пока всё это доступно и так.
              </span>
            </p>
          </Reveal>
        </div>
      </Section>

      <Section id="faq" eyebrow={<><MessageCircleQuestion className="size-3.5" /> Вопросы</>} title="Частые вопросы" center>
        <div className="mx-auto max-w-3xl">
          <Faq clubs={clubs} android={android} />
        </div>
      </Section>

      {/* Финальный призыв */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-28">
        <div className="relative overflow-hidden rounded-[2rem] border border-foreground/10 bg-card px-5 py-16 text-center sm:px-10 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_28%,transparent),transparent_60%),radial-gradient(circle_at_50%_120%,color-mix(in_oklch,var(--xp)_18%,transparent),transparent_55%)]" />
          <div className="relative space-y-6">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-black tracking-tight text-balance sm:text-5xl">
              Первый уровень — <GradientText>уже после первой тренировки</GradientText>
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">Регистрация за минуту. Без карты и без установки.</p>
            <Link href="/register" className={buttonVariants({ size: "lg", className: "h-13 px-8 text-base shadow-[0_12px_40px_-12px_var(--primary)]" })}>
              Создать аккаунт <ArrowRight aria-hidden />
            </Link>
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" aria-hidden /> Календарь и напоминания</li>
              <li className="flex items-center gap-1.5"><Users className="size-4 text-primary" aria-hidden /> Лига друзей</li>
              <li className="flex items-center gap-1.5"><BellRing className="size-4 text-primary" aria-hidden /> Push-уведомления</li>
            </ul>
          </div>
        </div>
      </section>

      <StickyCta />
    </>
  );
}

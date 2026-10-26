import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ArrowRight, BellRing, CalendarDays, Check, Crown, Download, Gift, Send, Smartphone, Sparkles, Users, X } from "lucide-react";
import { ClubInfographic } from "@/components/marketing/club-infographics";
import { Faq, faqFor } from "@/components/marketing/faq";
import { RaidInfographic } from "@/components/marketing/raid-infographics";
import { AssignedWeek, CatalogListing, ClientNote, ClientRows, CoachNote, InviteFlow, ProgramWeeks, ProgressionTicker, TrainerCard, WeekRecap } from "@/components/marketing/coach-infographics";
import { Hero } from "@/components/marketing/v2/hero";
import { How } from "@/components/marketing/v2/how";
import { Bento, FEATURE_LIST } from "@/components/marketing/v2/bento";
import { Game } from "@/components/marketing/v2/game";
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
import { APK_MIN_ANDROID, APK_URL } from "@/lib/native/apk";
import { absoluteUrl, jsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramAppUrl } from "@/lib/telegram/links";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};


const COMPARE: [feature: string, notebook: boolean][] = [
  ["Запись подходов, веса и повторов", true],
  ["Личные рекорды и 1ПМ считаются сами", false],
  ["Подсказка «пора увеличить вес»", false],
  ["Таймер отдыха с уведомлением", false],
  ["Графики прогресса по каждому упражнению", false],
  ["Мотивация: уровни, ачивки, streak, лига", false],
  ["Босс недели, сундуки и титулы", false],
  ["Восстановление мышц и баланс нагрузки", false],
  ["Напоминания о тренировках по плану", false],
  ["Тренировки с тренером: план, программы, задания и комментарии", false],
];

const CLUB_POINTS = [
  "Найдите свой зал или добавьте его — заявку проверит модератор",
  "Соревнуйтесь в рейтинге недели с теми, кто тренируется рядом",
  "Выполняйте задания клуба вместе и открывайте сундуки",
];

const GUILD_POINTS = [
  "Гильдия до 10 человек: вступают по ссылке, видят опыт друг друга за неделю и ленту тренировок",
  "Рейд-босс недели — общий: HP подстраивается под силы гильдии",
  "Сундук с опытом — каждому участнику, кто бил до победы; MVP, нанёсший больше всех урона, получает больше",
];

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

/** Режим тренера: утверждения держать в соответствии с приложением. */
const COACH_FEATURES: { title: string; text: string; visual: React.ReactNode }[] = [
  {
    title: "Приглашение по ссылке",
    text: "Отправьте клиенту ссылку — или ссылку в Telegram: клиент откроет Hero Fit прямо в мессенджере, без пароля. Доступ к своим тренировкам он разрешает сам и в любой момент может отозвать.",
    visual: <InviteFlow />,
  },
  {
    title: "Клиенты в одном списке",
    text: "Кто тренировался сегодня, кто пропадает, кому пора увеличить вес — видно сразу. По каждому — тренировки с подходами, статистика и карта мышц.",
    visual: <ClientRows />,
  },
  {
    title: "Итоги недели",
    text: "Каждый понедельник — сводка по всем клиентам: кто тренировался, рекорды, кому нужно внимание.",
    visual: <WeekRecap />,
  },
  {
    title: "Тренировки в календарь",
    text: "Назначьте шаблон на нужные дни недели на несколько недель вперёд. Клиент видит план на дашборде, а вы — что выполнено и что пропущено.",
    visual: <AssignedWeek />,
  },
  {
    title: "Программы на несколько недель",
    text: "Соберите цикл на 2–16 недель: дни по шаблонам, вес растёт каждую неделю на % или кг, разгрузка — по расписанию. Назначьте клиенту — веса недели подставятся сами.",
    visual: <ProgramWeeks />,
  },
  {
    title: "Задания и прогрессия",
    text: "Подходы, повторы и вес — свои для каждого клиента. Справился — в следующий раз тяжелее на шаг, три неудачи подряд — разгрузка.",
    visual: <ProgressionTicker />,
  },
  {
    title: "Комментарии к тренировкам",
    text: "Общий отзыв и заметки к упражнениям прямо в сводке тренировки — клиенту приходит уведомление.",
    visual: <CoachNote />,
  },
  {
    title: "Заметки о клиенте",
    text: "Цели, травмы со слов клиента, инвентарь — личная заметка в карточке клиента. Видите только вы.",
    visual: <ClientNote />,
  },
  {
    title: "Своя страница тренера",
    text: "Публичная страница с описанием, честными цифрами из приложения и кнопкой «Заниматься» — делитесь ссылкой, её находят и поисковики.",
    visual: <TrainerCard />,
  },
  {
    title: "Каталог тренеров",
    text: "Включите показ в каталоге — клиенты найдут вас по городу, формату и специализации и напишут напрямую. Контакты видят только вошедшие, а вы — сколько раз их открывали.",
    visual: <CatalogListing />,
  },
];

function SectionTitle({ eyebrow, title, text, id }: { eyebrow: string; title: string; text?: string; id?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {text ? <p className="mt-4 text-pretty text-muted-foreground">{text}</p> : null}
    </div>
  );
}

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

      {/* Гильдии и рейды */}
      <section aria-labelledby="guilds" className="relative scroll-mt-20 overflow-hidden border-t">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_70%_30%,color-mix(in_oklch,var(--destructive)_12%,transparent),transparent_60%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:py-24 lg:grid-cols-2 lg:gap-14">
          <div>
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">Гильдии</p>
            <h2 id="guilds" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Гильдии и рейды
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Собери команду и бейте общего босса. Каждая тренировка участника снимает ему HP — тот же урон, что и личному боссу недели.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              {GUILD_POINTS.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Собрать гильдию <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
          <Reveal>
            <RaidInfographic />
          </Reveal>
        </div>
      </section>

      {/* Клубы залов */}
      {clubs ? (
        <section aria-labelledby="clubs" className="relative scroll-mt-20 overflow-hidden border-t">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_30%_40%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_60%)]"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:py-24 lg:grid-cols-2 lg:gap-14">
            <Reveal className="lg:order-last">
              <ClubInfographic />
            </Reveal>
            <div>
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">Клубы</p>
              <h2 id="clubs" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Клубы залов
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Вступите в клуб своего зала: общий рейтинг недели и задания, которые выполняют все вместе.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {CLUB_POINTS.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={authed ? "/clubs" : `/register?next=${encodeURIComponent("/clubs")}`} className={buttonVariants({ size: "lg" })}>
                  Найти свой зал <ArrowRight aria-hidden />
                </Link>
                <Link
                  href={authed ? "/clubs/new" : `/register?next=${encodeURIComponent("/clubs/new")}`}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Добавить свой зал
                </Link>
              </div>
              {cities.length ? (
                <div className="mt-8">
                  <p className="text-sm font-semibold">Популярные города</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {cities.map((c) => (
                      <li key={c.path}>
                        <Link href={c.path} className="inline-flex rounded-full border px-3 py-1 text-sm transition-colors hover:border-primary/50">
                          {c.city}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Для тренеров */}
      <section aria-labelledby="coaches" className="relative scroll-mt-20 overflow-hidden border-t">
        {/* «Пульт тренера»: сетка рабочего экрана и свечение фирменного цвета */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--border)_70%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--border)_70%,transparent)_1px,transparent_1px)] bg-size-[40px_40px] mask-[radial-gradient(ellipse_at_30%_40%,black,transparent_75%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 -z-10 size-144 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_65%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-sm font-semibold tracking-wide text-primary uppercase">Для тренеров</p>
            <h2 id="coaches" className="mt-2 font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
              Ведите клиентов там, где им интересно тренироваться
            </h2>
            <p className="mt-4 text-pretty text-muted-foreground">
              Клиент качается в игровом дневнике — уровни, streak, босс недели. А вы видите каждую тренировку, назначаете план и ведёте
              прогрессию весов. Без таблиц и переписки в мессенджерах.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register?coach=1" className={buttonVariants({ size: "lg" })}>
                Стать тренером — бесплатно <ArrowRight aria-hidden />
              </Link>
              {showCatalogOnLanding(catalogCoaches) ? (
                <Link href="/trainers" className={buttonVariants({ size: "lg", variant: "outline" })}>
                  Найти тренера
                </Link>
              ) : null}
              <span className="text-sm text-muted-foreground">Пока идёт бета — всё бесплатно</span>
            </div>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {COACH_FEATURES.map((f, i) => (
              <Reveal
                as="li"
                delay={(i % 2) * 0.08}
                key={f.title}
                className="flex flex-col justify-between gap-5 rounded-2xl border bg-card/90 p-5 backdrop-blur transition-colors hover:border-primary/50"
              >
                <div>
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
                </div>
                {f.visual}
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* Сравнение */}
      <section aria-labelledby="compare" className="border-y bg-card/40">
        <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:py-24">
          <SectionTitle id="compare" eyebrow="Почему не блокнот" title="Блокнот запоминает. Hero Fit — ведёт к результату" />
          <div className="mt-10 overflow-hidden rounded-2xl border bg-card sm:mt-12">
            <table className="w-full text-sm">
              <caption className="sr-only">Сравнение Hero Fit и бумажного дневника тренировок</caption>
              <thead>
                <tr className="border-b text-left">
                  <th scope="col" className="p-3 font-semibold sm:p-4">Возможность</th>
                  <th scope="col" className="p-3 text-center font-semibold whitespace-nowrap text-muted-foreground sm:p-4">Блокнот</th>
                  <th scope="col" className="p-3 text-center font-semibold whitespace-nowrap text-primary sm:p-4">Hero Fit</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([feature, notebook]) => (
                  <tr key={feature} className="border-b last:border-0">
                    <th scope="row" className="p-3 text-left font-normal sm:p-4">{feature}</th>
                    <td className="p-3 text-center sm:p-4">
                      {notebook ? <Check className="mx-auto size-5 text-muted-foreground" aria-label="есть" /> : <X className="mx-auto size-5 text-muted-foreground/50" aria-label="нет" />}
                    </td>
                    <td className="p-3 text-center sm:p-4">
                      <Check className="mx-auto size-5 text-primary" aria-label="есть" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Тарифы */}
      {android ? (
        <section aria-labelledby="android" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-20 sm:pb-24">
          <div className="grid items-center gap-8 rounded-3xl border bg-card p-6 sm:p-10 md:grid-cols-[auto_1fr]">
            <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground md:size-24">
              <Smartphone className="size-10 md:size-12" aria-hidden />
            </div>
            <div className="space-y-4 text-center md:text-left">
              <p className="text-sm font-semibold tracking-wide text-primary uppercase">Android</p>
              <h2 id="android" className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
                Приложение для Android
              </h2>
              <p className="text-pretty text-muted-foreground">
                Таймер отдыха, серия и ачивки приходят уведомлением, даже когда приложение закрыто. Без сервисов Google: уведомления доставляет
                бесплатное приложение ntfy через наш сервер.
              </p>
              <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                <a href={APK_URL} download className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
                  <Download aria-hidden /> Скачать APK
                </a>
                <Link href="/android" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>
                  Как подключить уведомления
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Android {APK_MIN_ANDROID} и новее. При установке телефон попросит разрешить установку из этого источника — это нормально для приложений
                не из магазина.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pricing" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-20 sm:pb-24">
        <SectionTitle
          id="pricing"
          eyebrow="Тарифы"
          title="Сейчас всё бесплатно"
          text="Идёт ранний доступ — открыты все функции. Позже появится Премиум, а основное останется бесплатным навсегда."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:mt-14">
          <Reveal className="flex flex-col rounded-2xl border bg-card p-5 sm:p-6">
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
          <Reveal delay={0.08} className="relative flex flex-col rounded-2xl border border-primary/50 bg-card p-5 sm:p-6">
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
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pb-20 sm:pb-24">
        <SectionTitle id="faq" eyebrow="Вопросы" title="Частые вопросы" />
        <div className="mt-12">
          <Faq clubs={clubs} android={android} />
        </div>
      </section>

      {/* Финальный призыв */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-24">
        <div className="relative overflow-hidden rounded-3xl border bg-card px-5 py-14 text-center sm:px-10 sm:py-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_60%)]" />
          <div className="relative space-y-6">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Первый уровень — уже после первой тренировки</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">Регистрация за минуту. Без карты и без установки.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg", className: "h-12 px-8 text-base" })}>
                Создать аккаунт <ArrowRight aria-hidden />
              </Link>
              {telegramUrl ? (
                <a href={telegramUrl} className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-8 text-base" })}>
                  <Send aria-hidden /> Открыть в Telegram
                </a>
              ) : null}
            </div>
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" aria-hidden /> Календарь и напоминания</li>
              <li className="flex items-center gap-1.5"><Users className="size-4 text-primary" aria-hidden /> Лига друзей</li>
              <li className="flex items-center gap-1.5"><BellRing className="size-4 text-primary" aria-hidden /> Push-уведомления</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

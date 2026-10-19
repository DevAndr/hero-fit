import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ArrowRight, BellRing, Calculator, CalendarDays, Check, ClipboardList, Crown, Dumbbell, Gift, Play, Send, Sparkles, Users, X } from "lucide-react";
import { ClubInfographic } from "@/components/marketing/club-infographics";
import { Faq, faqFor } from "@/components/marketing/faq";
import { RaidInfographic } from "@/components/marketing/raid-infographics";
import { AssignedWeek, ClientNote, ClientRows, CoachNote, InviteFlow, ProgramWeeks, ProgressionTicker, TrainerCard, WeekRecap } from "@/components/marketing/coach-infographics";
import { BestiaryStrip, BossFight, MuscleMapMini } from "@/components/marketing/game-infographics";
import { HeroHud } from "@/components/marketing/hero-hud";
import { WhatsNewLink } from "@/components/marketing/whats-new-link";
import { CountUp, Reveal } from "@/components/marketing/motion";
import {
  BadgeRow,
  FreezeChip,
  LevelHud,
  MiniCalendar,
  MiniLeague,
  MiniRecap,
  MuscleBars,
  OfflineBadge,
  ProgressChart,
  RestTimerRing,
  StreakWeeks,
} from "@/components/marketing/infographics";
import { buttonVariants } from "@/components/ui/button";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { getPopularCities } from "@/lib/club/public-queries";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isEnabled } from "@/lib/flags/server";
import { absoluteUrl, jsonLd, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import { telegramEnabled } from "@/lib/telegram/format";
import { telegramAppUrl } from "@/lib/telegram/links";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

const NBSP = " ";

const STEPS = [
  {
    icon: ClipboardList,
    title: "Собери тренировку",
    text: "Выбери готовую программу или шаблон — или набери упражнения сам. Повторить прошлую тренировку — в один клик.",
  },
  {
    icon: Play,
    title: "Тренируйся с подсказками",
    text: "Отмечай подходы, вес и повторы. Таймер отдыха напомнит о следующем подходе, а калькулятор блинов — что вешать на гриф.",
  },
  {
    icon: Sparkles,
    title: "Прокачивайся",
    text: "Получай XP и уровни, бей рекорды и босса недели, держи недельный streak. В понедельник — итоги недели и место в лиге друзей.",
  },
];

type Feature = { title: string; text: string; visual: React.ReactNode; className?: string };

const FEATURES: Feature[] = [
  {
    title: "Уровни и XP за реальную работу",
    text: "Каждый подход, повтор и поднятый килограмм — это очки опыта. Рекорд добавляет +25 XP, а ежедневный сундук — бонус за то, что заглянул. Уровень растёт вместе с тобой.",
    visual: <LevelHud className="shadow-none" />,
    className: "lg:col-span-2",
  },
  {
    title: "Недельный streak",
    text: "3 тренировки в неделю — и серия растёт. Заболел или уехал — неделю спасёт заморозка, а сгоревшую серию можно выкупить за XP.",
    visual: (
      <div className="space-y-3">
        <StreakWeeks />
        <FreezeChip />
      </div>
    ),
  },
  {
    title: "Босс недели",
    text: "Каждую неделю — новый босс. Подходы бьют его по HP, подход до отказа — сильнее, рекорд — критический удар. Победил — открывай сундук с XP.",
    visual: <BossFight />,
    className: "sm:col-span-2",
  },
  {
    title: "Карта мышц",
    text: "Видно, какие мышцы ещё восстанавливаются, а какие можно нагружать, и где перекос за месяц. Тренировку по восстановлению соберёт одно касание.",
    visual: <MuscleMapMini />,
    className: "sm:col-span-2",
  },
  {
    title: "Рекорды и подсказки прогрессии",
    text: "Личные рекорды по 1ПМ, весу и повторам считаются сами. Когда пора добавить вес — приложение подскажет.",
    visual: <ProgressChart />,
  },
  {
    title: "Таймер отдыха",
    text: "Обратный отсчёт со звуком, вибрацией и push-уведомлением — даже при заблокированном экране. ±15 секунд одним касанием.",
    visual: <RestTimerRing />,
  },
  {
    title: "Ачивки, которые хочется собрать",
    text: "За количество тренировок, серию, рост веса в каждом упражнении, объём и рекорды. Генерируются по твоему прогрессу.",
    visual: <BadgeRow />,
  },
  {
    title: "Календарь тренировок",
    text: "Планируй тренировки по дням и времени, повторяй их каждую неделю и получай напоминание «Сегодня по плану».",
    visual: <MiniCalendar />,
    className: "lg:col-span-2",
  },
  {
    title: "Лига друзей",
    text: "Соревнуйтесь по XP за неделю, поддерживайте друг друга 👊 в ленте и давайте респект 🏆 за рекорды. Веса можно скрыть.",
    visual: <MiniLeague />,
  },
  {
    title: "Итоги недели",
    text: "Каждый понедельник — «Ты стал сильнее» с цифрами по упражнениям, рекорды, лучший подход, место в лиге и забытые группы мышц.",
    visual: <MiniRecap />,
  },
  {
    title: "Статистика и графики",
    text: "Месяц к месяцу, объём, время в зале, группы мышц, тренды по неделям, график силы по каждому упражнению и прогноз, когда достигнешь цели.",
    visual: <MuscleBars />,
  },
  {
    title: "Работает без интернета",
    text: "Приложение в браузере, ставится на главный экран как обычное. Без сети всё сохраняется и синхронизируется позже.",
    visual: <OfflineBadge />,
  },
];

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
  // Клубы — только когда открыты всем (флаг `clubs` на 100 %): раздел, строка тарифа, вопросы FAQ
  const [exercises, programs, clubs, cities, authed] = await Promise.all([
    db.exercise.count({ where: { userId: null } }),
    db.workoutTemplate.count({ where: { userId: null } }),
    isEnabled("clubs", null),
    getPopularCities(6),
    cookies().then((c) => c.has(ACCESS_COOKIE)),
  ]);
  const freePlan = FREE_PLAN.filter((t) => clubs || !t.startsWith("Клубы залов"));
  const faq = faqFor(clubs);
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
      featureList: FEATURES.map((f) => f.title),
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
    { value: 10, label: "групп мышц" },
    { value: 0, from: 990, suffix: " ₽", label: "ранний доступ: всё бесплатно" },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      {/* Герой */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_10%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_45%),radial-gradient(circle_at_0%_90%,color-mix(in_oklch,var(--streak)_12%,transparent),transparent_40%)]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[48px_48px] opacity-40 mask-[radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-20 px-4 pt-12 pb-28 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-20 lg:pb-32">
          <div className="space-y-7">
            {deleted ? (
              <p role="status" className="rounded-lg border bg-card/80 px-4 py-3 text-sm">
                Аккаунт удалён. Спасибо, что тренировались с Hero Fit
              </p>
            ) : null}
            <WhatsNewLink />
            <p className="hf-rise inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-sm text-muted-foreground">
              <Dumbbell className="size-4 text-primary" aria-hidden /> {telegramUrl ? "Бесплатно · в браузере, Telegram и офлайн" : "Бесплатно · в браузере и офлайн"}
            </p>
            <h1 className="hf-rise font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl" style={{ animationDelay: "0.05s" }}>
              Дневник тренировок, который превращает зал в <span className="text-primary">игру</span>
            </h1>
            <p className="hf-rise max-w-xl text-lg text-pretty text-muted-foreground" style={{ animationDelay: "0.1s" }}>
              Записывай подходы, вес и повторы — и получай XP, уровни и ачивки за реальный прогресс. Hero Fit помогает не бросить: недельный streak,
              напоминания и итоги недели.
            </p>
            <div className="hf-rise flex flex-wrap gap-3" style={{ animationDelay: "0.15s" }}>
              <Link href="/register" className={buttonVariants({ size: "lg", className: "h-12 px-6 text-base" })}>
                Начать бесплатно <ArrowRight aria-hidden />
              </Link>
              {telegramUrl ? (
                <a href={telegramUrl} className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>
                  <Send aria-hidden /> Открыть в Telegram
                </a>
              ) : (
                <Link href="#features" className={buttonVariants({ size: "lg", variant: "outline", className: "h-12 px-6 text-base" })}>
                  Что умеет
                </Link>
              )}
            </div>
            <ul className="hf-rise flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground" style={{ animationDelay: "0.2s" }}>
              {["Без установки", "Готовые программы", "Работает без сети", ...(telegramUrl ? ["Есть в Telegram"] : [])].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="size-4 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroHud />
        </div>
      </section>

      {/* Цифры */}
      <section aria-label="Hero Fit в цифрах" className="border-y bg-card/40">
        <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className="text-center">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-display text-3xl font-extrabold text-primary tabular-nums sm:text-4xl">
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

      {/* Как это работает */}
      <section aria-labelledby="how" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:py-24">
        <SectionTitle id="how" eyebrow="Как это работает" title="Три шага от первого подхода до нового уровня" />
        <ol className="mt-12 grid gap-4 sm:gap-6 lg:mt-14 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" delay={i * 0.1} key={title} className="relative rounded-2xl border bg-card p-5 sm:flex sm:items-start sm:gap-6 sm:p-6 lg:block">
              <div className="flex items-center gap-3 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start sm:gap-2 lg:w-auto">
                <span className="font-display text-5xl font-extrabold text-primary/20" aria-hidden>
                  0{i + 1}
                </span>
                <Icon className="size-6 text-primary" aria-hidden />
              </div>
              <div>
                <h3 className="mt-3 text-lg font-bold sm:mt-1 lg:mt-3">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{text}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Возможности */}
      <section aria-labelledby="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pb-20 sm:pb-24">
        <SectionTitle
          id="features"
          eyebrow="Возможности"
          title="Всё для прогресса — и немного игры"
          text="Не просто блокнот с цифрами: Hero Fit считает рекорды, подсказывает следующий шаг и мотивирует возвращаться в зал."
        />
        {/* dense — узкие карточки заполняют дыры рядом с широкими (col-span-2) на любой ширине */}
        <ul className="mt-12 grid grid-flow-dense gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal
              as="li"
              delay={(i % 4) * 0.08}
              key={f.title}
              className={cn("flex flex-col justify-between gap-6 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 sm:p-6", f.className)}
            >
              <div>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
              </div>
              {f.visual}
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Бестиарий */}
      <section aria-labelledby="bestiary" className="relative overflow-hidden border-t">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_oklch,var(--streak)_14%,transparent),transparent_60%)]"
        />
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-24">
          <SectionTitle
            id="bestiary"
            eyebrow="Бестиарий"
            title="12 боссов. Собери всех"
            text="Боссы приходят по кругу — каждую неделю новый. Победы дают звёзды, звёзды открывают титулы рядом с твоим ником в лиге и ленте друзей."
          />
          <Reveal className="mt-12 lg:mt-14">
            <BestiaryStrip />
          </Reveal>
        </div>
      </section>

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

      {/* Инструменты */}
      <section aria-labelledby="tools" className="mx-auto w-full max-w-6xl px-4 py-20 sm:py-24">
        <SectionTitle id="tools" eyebrow="Бесплатные инструменты" title="Посчитай прямо сейчас — без регистрации" />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {[
            { href: "/tools/1rm", icon: Calculator, title: "Калькулятор 1ПМ", text: "Одноповторный максимум по формуле Эпли и таблица рабочих весов на 1–12 повторений." },
            { href: "/tools/plates", icon: Dumbbell, title: "Калькулятор блинов и разминки", text: "Какие блины вешать на гриф для нужного веса и разминочные подходы к рабочему." },
          ].map(({ href, icon: Icon, title, text }) => (
            <Link key={href} href={href} className="group flex items-start gap-4 rounded-2xl border bg-card p-5 transition-colors hover:border-primary/50 sm:p-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-6" aria-hidden />
              </span>
              <span>
                <span className="block text-lg font-bold">
                  {title}
                  {NBSP}
                  <ArrowRight className="inline size-4 align-[-2px] transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{text}</span>
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Не знаете, с чего начать?{" "}
          <Link href="/training-programs" className="font-medium text-primary underline-offset-4 hover:underline">
            Готовые программы тренировок
          </Link>
          : Push Pull Legs, Full Body, 5×5, Верх / Низ и план для новичка.
        </p>
      </section>

      {/* Тарифы */}
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
          <Faq clubs={clubs} />
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

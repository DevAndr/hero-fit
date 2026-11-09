import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell, Briefcase, CalendarDays, Gamepad2, ListOrdered, MessageCircleQuestion, Sparkles, type LucideIcon } from "lucide-react";
import { FaqList } from "@/components/marketing/faq";
import { Reveal } from "@/components/marketing/motion";
import { CoachFeatures } from "@/components/marketing/v2/coaches";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { ClientsScreen } from "@/components/marketing/v2/screens/clients-screen";
import { Eyebrow, GradientText, Section, glass } from "@/components/marketing/v2/section";
import { StickyCta } from "@/components/marketing/v2/sticky-cta";
import { buttonVariants } from "@/components/ui/button";
import { COACH_SIGNUP_HREF } from "@/lib/coach/signup";
import { jsonLd, pageOpenGraph } from "@/lib/seo";
import { cn } from "@/lib/utils";

const TITLE = "Hero Fit для тренеров: ведите клиентов онлайн и в зале";
const DESCRIPTION =
  "Режим тренера в Hero Fit: тренировки и статистика клиентов, программы на недели вперёд, прогрессия весов, сигналы о пропусках и своя страница. Пока идёт бета — бесплатно.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["приложение для тренера", "программа для фитнес-тренера", "вести клиентов онлайн", "дневник тренировок клиента", "онлайн-тренер"],
  alternates: { canonical: "/for-coaches" },
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/for-coaches" }),
};

const BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Bell,
    title: "Видно, кому нужно внимание",
    text: "Кто пропускает тренировки, у кого застой и кому пора добавить вес — в списке клиентов и в уведомлениях.",
  },
  {
    icon: CalendarDays,
    title: "План уже у клиента",
    text: "Назначайте тренировки и программы на недели вперёд. Клиент видит план на дашборде и получает напоминание.",
  },
  {
    icon: Gamepad2,
    title: "Клиенту интересно",
    text: "Уровни, недельная серия, босс недели и ачивки превращают тренировки в игру, а вы видите каждый подход.",
  },
];

const START = ["Зарегистрируйтесь как тренер — или включите режим в настройках", "Отправьте клиенту ссылку-приглашение", "Назначьте план и смотрите, как он тренируется"];

/** Утверждения держать в соответствии с docs/features/coach.md и /privacy. */
const COACH_FAQ: { q: string; a: string }[] = [
  {
    q: "Сколько это стоит?",
    a: "Пока идёт бета, все возможности тренера бесплатны.",
  },
  {
    q: "Клиенту нужно платить или что-то устанавливать?",
    a: "Нет. Клиент открывает приглашение в браузере или в Telegram, где вход не требует пароля. Вести тренировки в Hero Fit для него бесплатно.",
  },
  {
    q: "Что я увижу о клиенте?",
    a: "Тренировки с подходами и весами, статистику, рекорды и карту мышц, и только у тех, кто сам принял приглашение и разрешил доступ. Логин и почту клиента вы не видите, а доступ он может отключить в настройках в любой момент.",
  },
  {
    q: "Как перевести клиентов в Hero Fit?",
    a: "Отправьте ссылку-приглашение в любом мессенджере. Клиент подтверждает доступ и появляется в вашем списке. Импорта истории из таблиц и других приложений пока нет: тренировки начинают записываться с момента подключения.",
  },
  {
    q: "Можно вести сразу многих клиентов?",
    a: "Да. Разложите клиентов по группам, назначайте план нескольким сразу, до 50 человек за раз, и копируйте готовый план от одного клиента другим. По понедельникам приходит сводка по всем клиентам.",
  },
  {
    q: "Как новые клиенты могут меня найти?",
    a: "Опубликуйте страницу тренера с описанием и кнопкой «Заниматься», её находят и поисковики. Если включите показ в каталоге, вас смогут найти по городу, формату и специализации и написать напрямую.",
  },
  {
    q: "Смогу ли я тренироваться сам?",
    a: "Да. Режим тренера добавляется к обычному аккаунту: ваши тренировки, уровни и ачивки работают как у всех.",
  },
];

/** Лендинг для тренеров. Главная (/) — для атлетов, там только плашка CoachesTeaser. */
export default function ForCoachesPage() {
  const structured = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: COACH_FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} />

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_45%),radial-gradient(circle_at_5%_95%,color-mix(in_oklch,var(--xp)_12%,transparent),transparent_40%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pt-20 lg:pb-28">
          <div className="space-y-7">
            <Eyebrow>
              <Briefcase className="size-3.5" aria-hidden /> Тренерам
            </Eyebrow>
            <h1 className="font-display text-[2.1rem] leading-[1.05] font-black tracking-tight text-balance sm:text-5xl lg:text-[3.5rem]">
              Ведите клиентов там, где им <GradientText>интересно тренироваться</GradientText>
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl">
              Клиент качается в игровом дневнике, а вы видите каждую тренировку, назначаете план и ведёте прогрессию. Без таблиц и переписки.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={COACH_SIGNUP_HREF}
                className={buttonVariants({ size: "lg", className: "h-13 px-7 text-base shadow-[0_12px_40px_-12px_var(--primary)]" })}
              >
                Стать тренером — бесплатно <ArrowRight aria-hidden />
              </Link>
              <Link href="#features" className={buttonVariants({ size: "lg", variant: "outline", className: "h-13 bg-card/50 px-7 text-base backdrop-blur" })}>
                Все возможности
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">Пока идёт бета — всё бесплатно</p>
          </div>
          <div className="flex justify-center">
            <PhoneFrame label="Экран тренера: клиенты и сигналы" tilt="left">
              <ClientsScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      <Section id="benefits" eyebrow={<><Sparkles className="size-3.5" /> Зачем</>} title="Меньше таблиц и переписки" center>
        <ul className="grid gap-4 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }, i) => (
            <Reveal as="li" key={title} delay={i * 0.07} className={cn(glass, "p-6")}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </Reveal>
          ))}
        </ul>
      </Section>

      <Section id="start" eyebrow={<><ListOrdered className="size-3.5" /> Старт</>} title="Как начать" center>
        <ol className={cn(glass, "mx-auto max-w-2xl space-y-4 p-6 sm:p-8")}>
          {START.map((t, i) => (
            <li key={t} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-black text-primary-foreground">
                {i + 1}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="features" eyebrow={<><Briefcase className="size-3.5" /> Возможности</>} title="Всё для работы с клиентами" className="overflow-hidden" center>
        <CoachFeatures />
      </Section>

      <Section id="faq" eyebrow={<><MessageCircleQuestion className="size-3.5" /> Вопросы</>} title="Частые вопросы тренеров" center>
        <div className="mx-auto max-w-3xl">
          <FaqList items={COACH_FAQ} />
        </div>
      </Section>

      <section aria-labelledby="coach-cta-title" className="mx-auto w-full max-w-6xl px-4 pb-28">
        <div className="relative overflow-hidden rounded-[2rem] border border-foreground/10 bg-card px-5 py-16 text-center sm:px-10 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklch,var(--primary)_28%,transparent),transparent_60%)]"
          />
          <div className="relative space-y-6">
            <h2 id="coach-cta-title" className="mx-auto max-w-2xl font-display text-3xl font-black tracking-tight text-balance sm:text-5xl">
              Пригласите первого клиента <GradientText>уже сегодня</GradientText>
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">Регистрация за минуту. Без карты и без установки.</p>
            <Link href={COACH_SIGNUP_HREF} className={buttonVariants({ size: "lg", className: "h-13 px-8 text-base shadow-[0_12px_40px_-12px_var(--primary)]" })}>
              Стать тренером — бесплатно <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <StickyCta href={COACH_SIGNUP_HREF} label="Стать тренером" />
    </>
  );
}

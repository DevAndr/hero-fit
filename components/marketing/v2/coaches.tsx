import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import { AssignedWeek, CatalogListing, ClientNote, ClientRows, CoachNote, InviteFlow, ProgramWeeks, ProgressionTicker, TrainerCard, WeekRecap } from "@/components/marketing/coach-infographics";
import { Reveal } from "@/components/marketing/motion";
import { CoachBadgesMini, CoachCalendarMini, GroupsMini } from "@/components/marketing/v2/coach-extra";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { ClientsScreen } from "@/components/marketing/v2/screens/clients-screen";
import { Section, glass } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Все возможности режима тренера без флагов. Утверждения держать в соответствии с docs/features/coach.md. */
const FEATURES: { title: string; text: string; visual: ReactNode; className?: string }[] = [
  {
    title: "Приглашение по ссылке",
    text: "Отправьте ссылку — или ссылку в Telegram: клиент откроет Hero Fit в мессенджере без пароля. Доступ к тренировкам он разрешает сам и может отозвать.",
    visual: <InviteFlow />,
  },
  {
    title: "Клиенты и сигналы",
    text: "Кто пропадает, у кого застой, кому пора добавить вес — видно сразу. По каждому — тренировки, статистика и карта мышц.",
    visual: <ClientRows />,
  },
  {
    title: "Группы клиентов",
    text: "Разложите клиентов по группам — «Утро», «Онлайн», «Новички» — и фильтруйте список и календарь по группе.",
    visual: <GroupsMini />,
  },
  {
    title: "Календарь клиентов",
    text: "Все назначенные тренировки всех клиентов на одной странице: что выполнено, что пропущено, что впереди.",
    visual: <CoachCalendarMini />,
  },
  {
    title: "Тренировки в календарь",
    text: "Назначьте шаблон на нужные дни на несколько недель вперёд — клиент увидит план на дашборде и напоминание.",
    visual: <AssignedWeek />,
  },
  {
    title: "Программы на 2–16 недель",
    text: "Дни по шаблонам, вес растёт каждую неделю на % или кг, разгрузка — по расписанию. Веса недели подставятся сами.",
    visual: <ProgramWeeks />,
    className: "lg:col-span-2",
  },
  {
    title: "Задания и прогрессия",
    text: "Подходы, повторы и вес — свои для каждого клиента. Справился — в следующий раз тяжелее, три неудачи подряд — разгрузка.",
    visual: <ProgressionTicker />,
  },
  {
    title: "Комментарии к тренировкам",
    text: "Общий отзыв и заметки к упражнениям прямо в сводке тренировки — клиенту приходит уведомление.",
    visual: <CoachNote />,
  },
  {
    title: "Заметки о клиенте",
    text: "Цели, травмы со слов клиента, инвентарь — личная заметка в карточке. Видите только вы.",
    visual: <ClientNote />,
  },
  {
    title: "Итоги недели",
    text: "Каждый понедельник — сводка по всем клиентам: кто тренировался, рекорды и кому нужно внимание.",
    visual: <WeekRecap />,
  },
  {
    title: "Своя страница тренера",
    text: "Описание, честные цифры из приложения и кнопка «Заниматься» — делитесь ссылкой, её находят и поисковики.",
    visual: <TrainerCard />,
  },
  {
    title: "Каталог тренеров",
    text: "Включите показ в каталоге — клиенты найдут вас по городу, формату и специализации и напишут напрямую.",
    visual: <CatalogListing />,
  },
  {
    title: "Ачивки тренера",
    text: "За первого ученика, разборы тренировок, рекорды и цели учеников — свои награды и титулы.",
    visual: <CoachBadgesMini className="lg:grid-cols-4" />,
    // 13 карточек: две широкие закрывают последние ряды без дыр (sm — 2 колонки, lg — 3)
    className: "sm:col-span-2",
  },
];

const START = ["Включите режим тренера в настройках", "Отправьте клиенту ссылку-приглашение", "Назначьте план — и смотрите, как он тренируется"];

/** «Тренерам»: телефон с клиентами, как начать, и все возможности с анимированной инфографикой. */
export function Coaches({ showFind }: { showFind: boolean }) {
  return (
    <Section
      id="coaches"
      eyebrow={<><Briefcase className="size-3.5" /> Тренерам</>}
      title="Ведите клиентов там, где им интересно тренироваться"
      lead="Клиент качается в игровом дневнике — уровни, серия, босс недели. А вы видите каждую тренировку, назначаете план и ведёте прогрессию. Без таблиц и переписки."
      className="overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 -z-10 size-144 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_65%)]"
      />
      <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr]">
        <PhoneFrame label="Экран тренера: клиенты и сигналы" tilt="left">
          <ClientsScreen />
        </PhoneFrame>
        <div className="space-y-8">
          <div className={cn(glass, "p-6")}>
            <p className="font-semibold">Как начать</p>
            <ol className="mt-4 space-y-3">
              {START.map((t, i) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-display text-sm font-black text-primary-foreground">
                    {i + 1}
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/register?coach=1" className={buttonVariants({ size: "lg" })}>
              Стать тренером — бесплатно <ArrowRight aria-hidden />
            </Link>
            {showFind ? (
              <Link href="/trainers" className={buttonVariants({ size: "lg", variant: "outline" })}>
                Найти тренера
              </Link>
            ) : null}
            <span className="text-sm text-muted-foreground">Пока идёт бета — всё бесплатно</span>
          </div>
        </div>
      </div>

      <ul aria-label="Возможности тренера" className="mt-16 grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <Reveal
            as="li"
            key={f.title}
            delay={(i % 3) * 0.07}
            className={cn(glass, "flex flex-col justify-between gap-5 p-5 transition-colors hover:border-primary/40", f.className)}
          >
            <div>
              <h3 className="font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
            </div>
            {f.visual}
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}

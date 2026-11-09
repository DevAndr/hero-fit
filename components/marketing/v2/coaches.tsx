import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase } from "lucide-react";
import { AssignedWeek, CatalogListing, ClientNote, ClientRows, CoachNote, InviteFlow, ProgramWeeks, ProgressionTicker, TrainerCard, WeekRecap } from "@/components/marketing/coach-infographics";
import { Reveal } from "@/components/marketing/motion";
import { CoachBadgesMini, CoachCalendarMini, GroupsMini } from "@/components/marketing/v2/coach-extra";
import { glass } from "@/components/marketing/v2/section";
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

/** Возможности режима тренера с анимированной инфографикой (страница /for-coaches). */
export function CoachFeatures() {
  return (
    <ul aria-label="Возможности тренера" className="grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  );
}

/** Плашка на главной для атлетов: подробности для тренеров — на /for-coaches, id="coaches" держит старые ссылки /#coaches. */
export function CoachesTeaser({ showFind }: { showFind: boolean }) {
  return (
    <section aria-labelledby="coaches-title" id="coaches" className="scroll-mt-20 px-4 py-10">
      <div className={cn(glass, "mx-auto flex w-full max-w-5xl flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between")}>
        <div className="space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
            <Briefcase className="size-3.5" aria-hidden /> Тренерам
          </p>
          <h2 id="coaches-title" className="font-display text-2xl font-extrabold tracking-tight">
            Вы тренер?
          </h2>
          <p className="max-w-xl text-muted-foreground">Ведите клиентов в Hero Fit: план, прогрессия и все их тренировки в одном месте.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link href="/for-coaches" className={buttonVariants({ size: "lg" })}>
            Подробнее для тренеров <ArrowRight aria-hidden />
          </Link>
          {showFind ? (
            <Link href="/trainers" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Найти тренера
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

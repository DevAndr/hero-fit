import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Calculator, CalendarDays, Flame, Medal, Target, WifiOff } from "lucide-react";
import { BadgeRow, FreezeChip, MiniCalendar, OfflineBadge, ProgressChart, StreakWeeks } from "@/components/marketing/infographics";
import { MuscleMapMini } from "@/components/marketing/game-infographics";
import { Reveal } from "@/components/marketing/motion";
import { Section, glass } from "@/components/marketing/v2/section";
import { cn } from "@/lib/utils";

type Tile = { title: string; text: string; icon: typeof Flame; visual: ReactNode; className?: string };

/** Цель «присед 100 кг»: прогресс и прогноз — как в разделе «Цели». */
function GoalMini() {
  return (
    <div aria-hidden className="rounded-xl border bg-background/60 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Присед 100 кг</span>
        <span className="text-xs text-muted-foreground">к 1 декабря</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-[85%] rounded-full bg-primary" />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">85 кг из 100 · успеваешь к сроку</p>
    </div>
  );
}

const TOOLS = [
  { href: "/tools/1rm", label: "Калькулятор 1ПМ" },
  { href: "/tools/plates", label: "Блины и разминка" },
  { href: "/tools/dots-wilks", label: "DOTS и Wilks" },
];

function ToolLinks() {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {TOOLS.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className="group flex items-center justify-between gap-2 rounded-xl border bg-background/60 px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/50"
          >
            {t.label}
            <ArrowRight aria-hidden className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const TILES: Tile[] = [
  {
    title: "Тренд силы и рекорды",
    text: "Рекорды по 1ПМ, весу и повторам считаются сами, график силы — по каждому упражнению, а подсказка скажет, когда пора добавить вес.",
    icon: BarChart3,
    visual: <ProgressChart />,
    className: "lg:col-span-2",
  },
  {
    title: "Карта восстановления",
    text: "Какие мышцы ещё отдыхают, а какие готовы к нагрузке — и тренировка по восстановлению одним касанием.",
    icon: Flame,
    visual: <MuscleMapMini />,
    className: "lg:col-span-2",
  },
  {
    title: "Недельная серия",
    text: "Три тренировки в неделю — серия растёт. Заболел — неделю спасёт заморозка.",
    icon: Flame,
    visual: (
      <div className="space-y-3">
        <StreakWeeks />
        <FreezeChip />
      </div>
    ),
  },
  {
    title: "Программы и календарь",
    text: "Push Pull Legs, Full Body, 5×5 и свои шаблоны. План по дням — с напоминанием «Сегодня по плану».",
    icon: CalendarDays,
    visual: <MiniCalendar />,
  },
  {
    title: "Ачивки",
    text: "За тренировки, серию, рост веса, объём и рекорды — открываются по твоему прогрессу.",
    icon: Medal,
    visual: <BadgeRow />,
  },
  {
    title: "Цели",
    text: "Поставь цель по весу, тренировкам или серии — приложение покажет, успеваешь ли к сроку.",
    icon: Target,
    visual: <GoalMini />,
  },
  {
    title: "Работает без сети",
    text: "В подвальном зале без связи всё сохранится и синхронизируется позже.",
    icon: WifiOff,
    visual: <OfflineBadge />,
    className: "lg:col-span-2",
  },
  {
    title: "Калькуляторы",
    text: "Бесплатно и без регистрации: одноповторный максимум, блины на гриф с разминкой, сила в троеборье.",
    icon: Calculator,
    visual: <ToolLinks />,
    className: "lg:col-span-2",
  },
];

/** Для JSON-LD SoftwareApplication.featureList. */
export const FEATURE_LIST = TILES.map((t) => t.title);

/** «Всё для прогресса»: бенто-сетка с живой мини-инфографикой. */
export function Bento() {
  return (
    <Section
      id="features"
      eyebrow={<><BarChart3 className="size-3.5" /> Прогресс</>}
      title="Всё для прогресса"
      lead="Не блокнот с цифрами: Hero Fit сам считает рекорды, подсказывает следующий шаг и показывает, как ты растёшь."
    >
      <ul className="grid grid-flow-dense gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map(({ title, text, icon: Icon, visual, className }, i) => (
          <Reveal
            as="li"
            key={title}
            delay={(i % 4) * 0.07}
            className={cn(glass, "flex flex-col justify-between gap-6 p-5 transition-colors hover:border-primary/40 sm:p-6", className)}
          >
            <div>
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
            </div>
            {visual}
          </Reveal>
        ))}
      </ul>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Не знаете, с чего начать?{" "}
        <Link href="/training-programs" className="font-medium text-primary underline underline-offset-4 hover:no-underline">
          Готовые программы тренировок
        </Link>
      </p>
    </Section>
  );
}

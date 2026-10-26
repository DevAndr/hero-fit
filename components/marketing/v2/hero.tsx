import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Send, Smartphone, Sparkles, Trophy, Zap } from "lucide-react";
import { Reveal } from "@/components/marketing/motion";
import { PhoneFrame } from "@/components/marketing/v2/phone-frame";
import { DashboardScreen } from "@/components/marketing/v2/screens/dashboard-screen";
import { GradientText } from "@/components/marketing/v2/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** «a, b и c» */
const joinRu = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} и ${items.at(-1)}`);

/** Всплывающая карточка вокруг телефона героя. */
function Float({ children, className, delay }: { children: ReactNode; className: string; delay: number }) {
  return (
    <Reveal delay={delay} className={cn("absolute z-10 hidden sm:block", className)}>
      <div aria-hidden className="flex items-center gap-2 rounded-2xl border border-foreground/10 bg-card/85 px-3 py-2 text-sm shadow-xl backdrop-blur-md">
        {children}
      </div>
    </Reveal>
  );
}

/** Герой лендинга v2: обещание, кнопки, строка доверия и живой телефон с дашбордом. */
export function Hero({ notice, whatsNew, android, telegramUrl }: { notice: ReactNode; whatsNew: ReactNode; android: boolean; telegramUrl: string | null }) {
  const trust = `Бесплатно · без рекламы · ${joinRu(["сайт", ...(android ? ["Android"] : []), ...(telegramUrl ? ["Telegram"] : [])])}`;
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,color-mix(in_oklch,var(--primary)_24%,transparent),transparent_45%),radial-gradient(circle_at_95%_75%,color-mix(in_oklch,var(--xp)_16%,transparent),transparent_40%),radial-gradient(circle_at_5%_95%,color-mix(in_oklch,var(--streak)_10%,transparent),transparent_40%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[44px_44px] opacity-35 mask-[radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-10 pb-20 sm:pt-14 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pt-20 lg:pb-28">
        <div className="space-y-7">
          {notice}
          {whatsNew}
          <h1 className="hf-rise font-display text-[2.6rem] leading-[1.02] font-black tracking-tight text-balance sm:text-6xl lg:text-[4rem]">
            Дневник тренировок, который <GradientText>не даст бросить</GradientText>
          </h1>
          <p className="hf-rise max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl" style={{ animationDelay: "0.08s" }}>
            Подходы, рекорды и прогресс — в одном месте. За каждую тренировку — XP, уровни и ачивки, а недельная серия не даёт сорваться.
          </p>
          <div className="hf-rise flex flex-wrap gap-3" style={{ animationDelay: "0.14s" }}>
            <Link
              href="/register"
              className={buttonVariants({ size: "lg", className: "h-13 px-7 text-base shadow-[0_12px_40px_-12px_var(--primary)]" })}
            >
              Начать бесплатно <ArrowRight aria-hidden />
            </Link>
            <Link href="#how" className={buttonVariants({ size: "lg", variant: "outline", className: "h-13 bg-card/50 px-7 text-base backdrop-blur" })}>
              Как это работает
            </Link>
          </div>
          <p className="hf-rise flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground" style={{ animationDelay: "0.2s" }}>
            <span>{trust}</span>
            {telegramUrl ? (
              <a href={telegramUrl} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
                <Send className="size-4" aria-hidden /> Открыть в Telegram
              </a>
            ) : null}
            {android ? (
              // Якорь к карточке Android — меню шапки на телефоне скрыто
              <a href="#android" className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
                <Smartphone className="size-4" aria-hidden /> Приложение для Android ↓
              </a>
            ) : null}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-sm">
          <div aria-hidden className="absolute inset-6 -z-10 rounded-full bg-primary/25 blur-3xl" />
          <PhoneFrame label="Дашборд Hero Fit: уровень, XP и серия недель" tilt="right">
            <DashboardScreen />
          </PhoneFrame>
          <Float className="top-16 -left-14" delay={0.6}>
            <Zap className="size-4 text-xp" /> <b className="tabular-nums">+120 XP</b> за тренировку
          </Float>
          <Float className="top-1/2 -right-16" delay={0.9}>
            <Trophy className="size-4 text-xp" />
            <span>
              <b>Новый рекорд</b>
              <span className="block text-xs text-muted-foreground">присед 100 кг</span>
            </span>
          </Float>
          <Float className="bottom-14 -left-10" delay={1.2}>
            <Sparkles className="size-4 text-primary" />
            <span>
              Ачивка: <b>Клуб сотки</b>
            </span>
          </Float>
        </div>
      </div>
    </section>
  );
}

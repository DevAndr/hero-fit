import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * `clubs` — пункт только при открытых клубах (флаг `clubs` на 100 %), `android` — при Android-приложении для всех
 * (флаг `native_app`), `trainers` — при каталоге тренеров для всех (флаг `coach_catalog`). Пунктов — не больше, чем влезает в max-w-6xl:
 * иначе кнопки справа уезжают за экран. «Как это работает», «Калькулятор блинов» и «Что нового» — в подвале.
 */
const NAV: { href: string; label: string; clubs?: true; android?: true; trainers?: true }[] = [
  { href: "/#features", label: "Возможности" },
  { href: "/tools/1rm", label: "Калькулятор 1ПМ" },
  { href: "/#guilds", label: "Гильдии" },
  { href: "/#clubs", label: "Клубы", clubs: true },
  { href: "/#coaches", label: "Тренерам" },
  { href: "/trainers", label: "Тренеры", trainers: true },
  { href: "/#android", label: "Android", android: true },
  { href: "/#pricing", label: "Тарифы" },
  { href: "/#faq", label: "Вопросы" },
];

/** Шапка публичных страниц; вошедшему — сразу в кабинет. */
export function SiteHeader({ authed, clubs, android, trainers }: { authed: boolean; clubs: boolean; android: boolean; trainers: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-display font-extrabold tracking-tight whitespace-nowrap" aria-label="Hero Fit — на главную">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Dumbbell className="size-4" aria-hidden />
          </span>
          Hero Fit
        </Link>
        <nav aria-label="Разделы сайта" className="hidden items-center gap-5 text-sm whitespace-nowrap text-muted-foreground xl:flex">
          {NAV.filter((n) => (clubs || !n.clubs) && (android || !n.android) && (trainers || !n.trainers)).map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {authed ? (
            <Link href="/dashboard" className={buttonVariants()}>
              Открыть кабинет
            </Link>
          ) : (
            <>
              {/* cn, а не className в buttonVariants: cva не сливает классы, и базовый inline-flex перебивал hidden */}
              <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>
                Войти
              </Link>
              <Link href="/register" className={buttonVariants()}>
                Начать бесплатно
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

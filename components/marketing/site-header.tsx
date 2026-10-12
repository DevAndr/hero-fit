import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

const NAV = [
  { href: "/#features", label: "Возможности" },
  { href: "/#how", label: "Как это работает" },
  { href: "/tools/1rm", label: "Калькулятор 1ПМ" },
  { href: "/tools/plates", label: "Калькулятор блинов" },
  { href: "/#guilds", label: "Гильдии" },
  { href: "/#coaches", label: "Тренерам" },
  { href: "/#pricing", label: "Тарифы" },
  { href: "/changelog", label: "Что нового" },
  { href: "/#faq", label: "Вопросы" },
];

/** Шапка публичных страниц; вошедшему — сразу в кабинет. */
export function SiteHeader({ authed }: { authed: boolean }) {
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
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {authed ? (
            <Link href="/dashboard" className={buttonVariants()}>
              Открыть кабинет
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost", className: "hidden sm:inline-flex" })}>
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

import Link from "next/link";

const COLUMNS = [
  {
    title: "Продукт",
    links: [
      { href: "/#features", label: "Возможности" },
      { href: "/#how", label: "Как это работает" },
      { href: "/#faq", label: "Частые вопросы" },
    ],
  },
  {
    title: "Инструменты",
    links: [
      { href: "/tools/1rm", label: "Калькулятор 1ПМ" },
      { href: "/tools/plates", label: "Калькулятор блинов и разминки" },
    ],
  },
  {
    title: "Аккаунт",
    links: [
      { href: "/register", label: "Регистрация" },
      { href: "/login", label: "Вход" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-4">
        <div className="space-y-2">
          <p className="font-display font-extrabold">Hero Fit</p>
          <p className="text-sm text-muted-foreground">Дневник тренировок в игровом стиле: уровни, streak, ачивки и честный прогресс.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title} className="space-y-2 text-sm">
            <p className="font-semibold">{c.title}</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="pb-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Hero Fit</p>
    </footer>
  );
}

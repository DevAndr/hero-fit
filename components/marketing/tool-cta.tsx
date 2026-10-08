import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Призыв на страницах инструментов: калькулятор встроен в дневник, рекорды считаются сами. */
export function ToolCta({ text }: { text: string }) {
  return (
    <aside className="rounded-2xl border bg-card p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="font-display text-lg font-bold">Считать вручную больше не придётся</p>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
      <Link href="/register" className={buttonVariants({ size: "lg", className: "mt-4 shrink-0 sm:mt-0" })}>
        Попробовать бесплатно <ArrowRight aria-hidden />
      </Link>
    </aside>
  );
}

/** Хлебные крошки (видимые) — та же цепочка уходит в BreadcrumbList. */
export function Breadcrumbs({ items }: { items: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.href} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {i < items.length - 1 ? (
              <Link href={it.href} className="hover:text-foreground">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

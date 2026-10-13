import Link from "next/link";
import { SECTIONS, type Release } from "@/lib/changelog/types";

const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Релизы «Что нового» (уже отфильтрованные visibleRelease): общий для /changelog и /whats-new. */
export function ReleaseList({ releases }: { releases: Release[] }) {
  return (
    <div className="space-y-8">
      {releases.map((r) => (
        <article key={r.id} id={r.id} aria-label={r.title} className="scroll-mt-24 space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <header className="space-y-1">
            <p className="text-sm text-muted-foreground">
              <time dateTime={r.date}>{date.format(new Date(`${r.date}T12:00:00Z`)).replace(/\s*г\.$/, "")}</time>
              <span className="ml-2 rounded-md border px-1.5 py-0.5 font-mono text-xs">v{r.version}</span>
            </p>
            <h2 className="font-display text-xl font-bold sm:text-2xl">{r.title}</h2>
            <p className="text-pretty text-muted-foreground">{r.summary}</p>
          </header>
          {SECTIONS.map(([key, label]) => {
            const items = r[key];
            if (!items?.length) return null;
            return (
              <section key={key} className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{label}</h3>
                <ul className="space-y-1.5">
                  {items.map((i) => (
                    <li key={i.text} className="ml-5 list-disc text-pretty">
                      {i.href ? (
                        <Link href={i.href} className="underline-offset-4 hover:underline">
                          {i.text}
                        </Link>
                      ) : (
                        i.text
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </article>
      ))}
    </div>
  );
}

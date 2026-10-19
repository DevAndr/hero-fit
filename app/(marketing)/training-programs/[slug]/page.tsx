import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgramCard } from "@/components/marketing/program-card";
import { Breadcrumbs, ToolCta } from "@/components/marketing/tool-cta";
import { buttonVariants } from "@/components/ui/button";
import { env } from "@/lib/env";
import { BUILTIN_PROGRAMS, programBySlug } from "@/lib/programs/builtin";
import { jsonLd, programJsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return BUILTIN_PROGRAMS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = programBySlug((await params).slug);
  if (!p) return {};
  const path = `/training-programs/${p.slug}`;
  return {
    title: { absolute: p.metaTitle },
    description: p.description,
    alternates: { canonical: path },
    openGraph: { title: p.metaTitle, description: p.description, url: path },
  };
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = programBySlug((await params).slug);
  if (!p) notFound();
  const crumbs = [
    { href: "/", label: "Hero Fit" },
    { href: "/training-programs", label: "Программы тренировок" },
    { href: `/training-programs/${p.slug}`, label: p.program },
  ];
  // Обычная ссылка, не Link: обработчик /start не должен префетчиться
  const start = (
    <a href={`/training-programs/${p.slug}/start`} className={buttonVariants({ size: "lg" })}>
      Начать программу
    </a>
  );
  const others = BUILTIN_PROGRAMS.filter((o) => o.slug !== p.slug);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(programJsonLd(env.APP_URL, p)) }} />
      <Breadcrumbs items={crumbs} />
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">{p.title}</h1>
        <p className="text-lg text-muted-foreground">{p.intro}</p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {[p.level, p.perWeek, `Дней в программе: ${p.days.length}`].map((t) => (
            <li key={t} className="rounded-full border bg-card px-3 py-1 text-muted-foreground">
              {t}
            </li>
          ))}
        </ul>
        <div>{start}</div>
      </header>

      <article className="space-y-4 text-pretty [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-muted-foreground">
        <h2>Для кого эта программа</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {p.forWhom.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <h2>Расписание недели</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {p.schedule.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>

        <h2>Упражнения по дням</h2>
        {p.days.map((d) => (
          <section key={d.name} className="space-y-2">
            <h3 className="font-display text-xl font-bold">{d.name}</h3>
            <p>{d.description}</p>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{d.name}: упражнения, подходы и повторы</caption>
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3 font-medium">
                      Упражнение
                    </th>
                    <th scope="col" className="p-3 font-medium whitespace-nowrap">
                      Подходы × повторы
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.exercises.map(([name, sets, reps]) => (
                    <tr key={name} className="border-t">
                      <td className="p-3">{name}</td>
                      <td className="p-3 whitespace-nowrap tabular-nums">{`${sets} × ${reps}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <h2>Как прибавлять вес</h2>
        <p>{p.progression}</p>
      </article>

      <aside className="flex flex-col gap-3 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-lg font-bold">Готовы начать? Первый день уже собран.</p>
        <div className="shrink-0">{start}</div>
      </aside>

      <article className="space-y-4 text-pretty [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_p]:text-muted-foreground">
        <h2>Частые вопросы</h2>
        {p.faq.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-semibold">{q}</h3>
            <p className="mt-1">{a}</p>
          </div>
        ))}
      </article>

      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold">Другие программы</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {others.map((o) => (
            <ProgramCard key={o.slug} program={o} />
          ))}
        </div>
      </section>

      <section className="space-y-2 text-muted-foreground">
        <h2 className="font-display text-2xl font-bold text-foreground">Калькуляторы</h2>
        <p>
          <Link href="/tools/1rm" className="text-primary underline-offset-4 hover:underline">
            Калькулятор 1ПМ
          </Link>{" "}
          поможет выбрать рабочий вес, а{" "}
          <Link href="/tools/plates" className="text-primary underline-offset-4 hover:underline">
            калькулятор блинов и разминки
          </Link>{" "}
          подскажет, что повесить на гриф.
        </p>
      </section>

      <ToolCta text="Hero Fit запомнит веса и повторы, запустит таймер отдыха и подскажет, когда пора увеличить вес." />
    </div>
  );
}

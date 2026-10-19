import type { Metadata } from "next";
import Link from "next/link";
import { ProgramCard } from "@/components/marketing/program-card";
import { Breadcrumbs, ToolCta } from "@/components/marketing/tool-cta";
import { env } from "@/lib/env";
import { BUILTIN_PROGRAMS } from "@/lib/programs/builtin";
import { PROGRAMS_CRUMBS as CRUMBS, absoluteUrl, jsonLd } from "@/lib/seo";

const TITLE = "Программы тренировок в зал: готовые планы на неделю";
const DESCRIPTION =
  "Пять готовых программ тренировок для зала: Push Pull Legs, Full Body, 5×5, Верх / Низ и план для новичка. Упражнения, подходы, расписание и запуск в один клик.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["программа тренировок", "программа тренировок в зал", "готовые программы тренировок", "программа для новичка в зале", "сплит"],
  alternates: { canonical: "/training-programs" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/training-programs" },
};

export default function ProgramsPage() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: CRUMBS.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: absoluteUrl(env.APP_URL, c.href) })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Программы тренировок в зал",
      itemListElement: BUILTIN_PROGRAMS.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.program, url: absoluteUrl(env.APP_URL, `/training-programs/${p.slug}`) })),
    },
  ];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />
      <Breadcrumbs items={CRUMBS} />
      <header className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">Программы тренировок в зал</h1>
        <p className="text-lg text-muted-foreground">
          Не нужно собирать план с нуля: выберите программу по уровню и числу дней в неделю, посмотрите упражнения, подходы и повторы — и запустите первую тренировку в один клик.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {BUILTIN_PROGRAMS.map((p) => (
          <ProgramCard key={p.slug} program={p} />
        ))}
      </div>

      <section className="space-y-2 text-muted-foreground">
        <h2 className="font-display text-2xl font-bold text-foreground">Калькуляторы</h2>
        <p>
          Подобрать рабочий вес поможет{" "}
          <Link href="/tools/1rm" className="text-primary underline underline-offset-4 hover:no-underline">
            калькулятор 1ПМ
          </Link>
          , а повесить нужные блины и разогреться перед подходом —{" "}
          <Link href="/tools/plates" className="text-primary underline underline-offset-4 hover:no-underline">
            калькулятор блинов и разминки
          </Link>
          .
        </p>
      </section>

      <ToolCta text="Программа сохраняется в вашем дневнике: Hero Fit ведёт подходы, таймер отдыха и подсказывает, когда пора увеличить вес." />
    </div>
  );
}

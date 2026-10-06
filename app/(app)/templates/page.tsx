import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { TemplateCard } from "@/components/templates/template-card";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { listTemplates } from "@/lib/templates/queries";

export const metadata: Metadata = { title: "Шаблоны" };

export default async function TemplatesPage() {
  const user = await requireUser();
  const { mine, programs } = await listTemplates(user.id);
  const byProgram = Map.groupBy(programs, (t) => t.program ?? "Программы");

  return (
    <>
      <PageHeader
        title="Шаблоны"
        description="Запуск тренировки в один клик"
        actions={
          <Link href="/templates/new" className={buttonVariants()}>
            <Plus />
            Новый шаблон
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Мои шаблоны</h2>
        {mine.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mine.map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <ClipboardList className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Создайте свой шаблон, скопируйте готовую программу или сохраните прошедшую тренировку как шаблон.
            </p>
          </div>
        )}
      </section>

      <div className="mt-8 space-y-8">
        <h2 className="text-lg font-bold">Готовые программы</h2>
        {[...byProgram].map(([program, items]) => (
          <section key={program} className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{program}</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((t) => (
                <TemplateCard key={t.id} template={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

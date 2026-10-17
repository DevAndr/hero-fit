import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/app-shell";
import { AuthorLink } from "@/components/catalog/catalog-card";
import { ProgramWeek } from "@/components/catalog/program-week";
import { StartProgramButton } from "@/components/catalog/start-program-dialog";
import { buttonVariants } from "@/components/ui/button";
import { requireCatalog } from "@/lib/catalog/access";
import { activePrograms, getCatalogProgram } from "@/lib/catalog/queries";
import { COACH_PROGRAM_RUNNING, startBlock } from "@/lib/catalog/rules";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Программа" };

const kg = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} кг`;

export default async function CatalogProgramPage({ params }: PageProps<"/programs/[id]">) {
  const user = await requireCatalog();
  const { id } = await params;
  const today = dayKey(new Date(), safeTimeZone(user.timeZone));
  const [program, [active]] = await Promise.all([getCatalogProgram(id, user.id), activePrograms(db, user.id, today)]);
  if (!program) notFound();
  const block = startBlock(active ?? null);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={program.name}
        description={`${program.weeks} нед. · ${program.ruleText}`}
        actions={
          <Link href="/programs" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Каталог
          </Link>
        }
      />
      <p className="text-sm text-muted-foreground">
        Автор: <AuthorLink author={program.author} /> · занимаются {program.participants}
      </p>
      {program.description ? <p className="whitespace-pre-line text-sm">{program.description}</p> : null}
      {program.available ? (
        <StartProgramButton
          programId={program.id}
          rule={program.rule}
          today={today}
          activeName={block === "replace" ? active.name : null}
          blocked={block === "coach" ? COACH_PROGRAM_RUNNING : null}
        />
      ) : null}
      <section aria-labelledby="week-title" className="space-y-2">
        <h2 id="week-title" className="font-semibold">
          Неделя тренировок
        </h2>
        <ProgramWeek days={program.days} />
      </section>
      <section aria-labelledby="preview-title" className="space-y-2">
        <h2 id="preview-title" className="font-semibold">
          Вес по неделям при базе 100 кг
        </h2>
        <ol aria-label="Предпросмотр по неделям" className="flex flex-wrap gap-1.5 text-xs tabular-nums">
          {program.preview.map((w) => (
            <li key={w.week} className={cn("rounded-md border px-2 py-1", w.deload && "border-dashed text-muted-foreground")}>
              {w.week}: {kg(w.weight)}
              {w.deload ? " ↓" : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { requireCoach } from "@/lib/coach/access";
import { planPct } from "@/lib/coach/recap";
import { listCoachRecaps } from "@/lib/coach/recap-queries";
import { plural } from "@/lib/format";
import { weekRangeLabel } from "@/lib/recap/view";

export const metadata: Metadata = { title: "Итоги недель клиентов" };

export default async function CoachRecapsPage({ searchParams }: PageProps<"/coach/recap">) {
  const coach = await requireCoach();
  const raw = (await searchParams).page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  const { items, hasMore } = await listCoachRecaps(coach.id, page);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Итоги недель"
        description="Сводка по всем клиентам"
        actions={
          <Link href="/coach" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Клиенты
          </Link>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <BarChart3 className="size-10 text-muted-foreground" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">Итоги появятся в понедельник после первой недели с клиентами.</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map(({ week, totals }) => (
            <li key={week}>
              <Link href={`/coach/recap/${week}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card p-4 hover:bg-accent">
                <span className="font-semibold">{weekRangeLabel(week)}</span>
                <span className="text-sm text-muted-foreground">
                  {totals.trained} из {totals.clients} {plural(totals.clients, "клиент", "клиента", "клиентов")}
                </span>
                {totals.plan ? <span className="text-sm text-muted-foreground">план {planPct(totals.plan)}%</span> : null}
                {totals.attention > 0 ? <span className="text-sm text-muted-foreground">внимание: {totals.attention}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page > 1 || hasMore ? (
        <nav aria-label="Страницы итогов" className="flex gap-2">
          {page > 1 ? (
            <Link href={page === 2 ? "/coach/recap" : `/coach/recap?page=${page - 1}`} className={buttonVariants({ variant: "outline" })}>
              Назад
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={`/coach/recap?page=${page + 1}`} className={buttonVariants({ variant: "outline" })}>
              Ещё
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

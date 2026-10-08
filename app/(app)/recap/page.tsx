import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/dal";
import { plural } from "@/lib/format";
import { listRecaps } from "@/lib/recap/queries";
import { delta, deltaLabel, weekRangeLabel } from "@/lib/recap/view";

export const metadata: Metadata = { title: "Итоги недель" };

export default async function RecapsPage({ searchParams }: PageProps<"/recap">) {
  const user = await requireUser();
  const raw = (await searchParams).page;
  const page = Math.max(1, Number(Array.isArray(raw) ? raw[0] : raw) || 1);
  const { items, hasMore } = await listRecaps(user.id, page);

  return (
    <>
      <PageHeader title="Итоги недель" />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <BarChart3 className="size-10 text-muted-foreground" />
          <p className="max-w-sm text-sm text-muted-foreground">Итоги появятся в понедельник после первой недели тренировок.</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {items.map(({ week, data }) => {
            const volume = data.totals.prev ? delta(data.totals.volume, data.totals.prev.volume) : null;
            const w = data.totals.workouts;
            return (
              <li key={week}>
                <Link href={`/recap/${week}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card p-4 hover:bg-accent">
                  <span className="font-semibold">{weekRangeLabel(week)}</span>
                  <span className="text-sm text-muted-foreground">
                    {w} {plural(w, "тренировка", "тренировки", "тренировок")}
                  </span>
                  {data.league && "place" in data.league ? (
                    <span className="text-sm text-muted-foreground">{data.league.place}-е место в лиге</span>
                  ) : null}
                  {volume && volume.pct !== null && volume.sign !== "same" ? (
                    <span className={volume.sign === "up" ? "text-sm font-semibold text-primary" : "text-sm text-muted-foreground"}>
                      объём {deltaLabel(data.totals.volume, data.totals.prev!.volume)}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {page > 1 || hasMore ? (
        <nav aria-label="Страницы итогов" className="mt-4 flex gap-2">
          {page > 1 ? (
            <Link href={page === 2 ? "/recap" : `/recap?page=${page - 1}`} className={buttonVariants({ variant: "outline" })}>
              Назад
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={`/recap?page=${page + 1}`} className={buttonVariants({ variant: "outline" })}>
              Ещё
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

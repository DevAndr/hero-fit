import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { recapHighlights } from "@/lib/recap/build";
import type { WeeklyRecapRow } from "@/lib/recap/queries";
import { weekRangeLabel } from "@/lib/recap/view";
import { cn } from "@/lib/utils";

/** Карточка «Итоги недели» на дашборде: до просмотра — акцентная с меткой «новое», после — компактная. */
export function RecapCard({ recap }: { recap: WeeklyRecapRow }) {
  const fresh = recap.seenAt === null;
  const highlights = recapHighlights(recap.data);
  return (
    <section
      aria-label="Итоги недели"
      className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between", fresh && "border-primary")}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-bold">
          <BarChart3 className="size-4 text-primary" aria-hidden />
          Итоги недели
          <span className="text-sm font-normal text-muted-foreground">{weekRangeLabel(recap.week)}</span>
          {fresh ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">новое</span> : null}
        </p>
        <p className={cn("mt-1 text-sm", fresh ? "font-semibold" : "truncate text-muted-foreground")}>{highlights.join(" · ")}</p>
      </div>
      <Link href={`/recap/${recap.week}`} className={buttonVariants({ variant: fresh ? "default" : "outline", size: "sm" })}>
        Смотреть итоги
      </Link>
    </section>
  );
}

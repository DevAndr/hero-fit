import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { planPct, type CoachRecapTotals } from "@/lib/coach/recap";

/** Анонс на /coach: итоги прошлой недели готовы и ещё не открывались. */
export function RecapAnnounce({ week, totals }: { week: string; totals: CoachRecapTotals }) {
  return (
    <section aria-label="Итоги недели готовы" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <BarChart3 className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-semibold">
        Тренировались {totals.trained} из {totals.clients}
        {totals.plan ? ` · план ${planPct(totals.plan)}%` : ""}
      </p>
      <Link href={`/coach/recap/${week}`} className={buttonVariants({ size: "sm" })}>
        Смотреть
      </Link>
    </section>
  );
}

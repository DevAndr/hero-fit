import { ArrowRight, ArrowUp } from "lucide-react";
import { StrengthBlock } from "@/components/recap/strength-block";
import type { MonthCompare } from "@/lib/stats/month";
import { cn } from "@/lib/utils";

/** «Месяц к месяцу»: те же дни прошлого месяца → текущий; рост — цветом, «меньше» — нейтрально (без красного). */
export function MonthCompareCard({ data }: { data: MonthCompare }) {
  return (
    <section aria-label="Месяц к месяцу" className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-bold">{data.title}</h2>
        <p className="text-sm text-muted-foreground">{data.caption}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-muted/40 p-3">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="mt-1 flex items-center gap-1.5 tabular-nums">
              <span className="text-muted-foreground">{r.prev}</span>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-label="→" />
              <span className={cn("font-bold", r.dir === "up" && "text-primary")}>{r.cur}</span>
              {r.dir === "up" ? <ArrowUp className="size-3.5 text-primary" aria-hidden /> : null}
            </dd>
          </div>
        ))}
      </dl>
      {data.strength ? <StrengthBlock strength={data.strength} label="Сила за месяц" /> : null}
    </section>
  );
}

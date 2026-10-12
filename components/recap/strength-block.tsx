import { TrendingUp } from "lucide-react";
import { trendHeadline, trendLine, type StrengthTrend } from "@/lib/stats/strength";

/** «Ты стал сильнее» — тренд силы 4 недели к 4 (итоги недели, «Месяц к месяцу»). */
export function StrengthBlock({ strength, label = "Сильнее" }: { strength: StrengthTrend; label?: string }) {
  return (
    <section aria-label={label} className="rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <TrendingUp className="size-4 text-primary" aria-hidden />
        {trendHeadline(strength)}
      </h2>
      {strength.top.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {strength.top.map((i) => (
            <li key={i.exerciseId}>{trendLine(i)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

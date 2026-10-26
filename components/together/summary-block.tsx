import { Users } from "lucide-react";
import { formatDuration } from "@/lib/format";
import type { TogetherSummary } from "@/lib/together/summary";

/** Сводка тренировки: «Вместе с …» — тренировка партнёра, время вместе и бонус. */
export function TogetherSummaryBlock({ summary }: { summary: TogetherSummary }) {
  const facts = [
    summary.durationSec ? formatDuration(summary.durationSec) : null,
    summary.sets ? `${summary.sets} подх.` : null,
    summary.records ? `рекордов: ${summary.records}` : null,
  ].filter(Boolean);
  return (
    <section aria-label="Вместе с партнёром" className="space-y-1.5 rounded-xl border bg-card p-4 text-sm">
      <h2 className="flex items-center gap-2 font-bold">
        <Users className="size-4 text-primary" aria-hidden />
        Вместе с {summary.partner}
      </h2>
      {facts.length ? <p className="text-muted-foreground">{summary.partner}: {facts.join(" · ")}</p> : null}
      {summary.overlapMin !== null ? <p className="text-muted-foreground">Тренировались одновременно {summary.overlapMin} мин</p> : null}
      <p className="font-medium">{summary.note}</p>
    </section>
  );
}

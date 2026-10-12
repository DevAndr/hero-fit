import Link from "next/link";
import { Target } from "lucide-react";
import { GoalBar } from "@/components/goals/goal-card";
import { GoalChestButton } from "@/components/goals/goal-chest-button";
import type { GoalView } from "@/lib/goals/queries";

/** Карточка «Цели» на дашборде: неоткрытые сундуки целей и 1–2 цели ближе всего к выполнению. */
export function GoalsCard({ goals, total }: { goals: GoalView[]; total: number }) {
  if (total === 0) {
    return (
      <section aria-label="Цели">
        <Link
          href="/goals"
          className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:border-primary/50"
        >
          <Target className="size-5 shrink-0 text-primary" />
          <span>
            <span className="block font-semibold text-foreground">Поставь первую цель</span>
            «Жим 100 кг», «50 тренировок до конца года» — прогресс посчитается сам.
          </span>
        </Link>
      </section>
    );
  }
  return (
    <section aria-label="Цели" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold">
          <Target className="size-4 text-primary" />
          Цели
        </h2>
        <Link href="/goals" className="text-xs text-primary hover:underline">
          Все цели
        </Link>
      </div>
      <ul className="space-y-3">
        {goals.map((g) => (
          <li key={g.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{g.title}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{g.status === "ACHIEVED" ? "Достигнута" : `${Math.round(g.progress * 100)} %`}</span>
            </div>
            <GoalBar goal={g} />
            {g.status === "ACTIVE" && g.forecast ? <p className="text-xs text-muted-foreground">Прогноз: {g.forecast.short}</p> : null}
            {g.status === "ACHIEVED" ? <GoalChestButton goalId={g.id} title={g.title} available={!g.chestOpenedAt} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

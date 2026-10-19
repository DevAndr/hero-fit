import { Target } from "lucide-react";
import { GoalChestButton } from "@/components/goals/goal-chest-button";
import type { FinishGoals } from "@/lib/goals/rules";

/** Сводка тренировки: выполненные ею цели (с сундуком, пока не открыт) и прирост по остальным. */
export function GoalsReached({ goals, unopened, readOnly }: { goals: FinishGoals; unopened: string[]; readOnly: boolean }) {
  return (
    <section aria-label="Цели" className="mt-4 space-y-2 rounded-xl border border-xp/40 bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Target className="size-4 text-xp" />
        Цели
      </h2>
      {goals.achieved.map((g) => (
        <div key={g.id} className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-xp">🎯 Цель достигнута: {g.title}</p>
          {!readOnly ? <GoalChestButton goalId={g.id} title={g.title} available={unopened.includes(g.id)} /> : null}
        </div>
      ))}
      {goals.advanced.length ? (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {goals.advanced.map((g) => (
            <li key={g.id} className="tabular-nums">
              {g.title}: {Math.round(g.before * 100)} → {Math.round(g.after * 100)} %
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

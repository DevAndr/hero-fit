import { CATEGORY_META } from "@/components/achievements/category";
import type { Goal } from "@/lib/achievements/definitions";
import { cn } from "@/lib/utils";

export function GoalCard({ goal }: { goal: Goal }) {
  const { icon: Icon, color } = CATEGORY_META[goal.category];
  const { unit } = goal;
  return (
    <div className="flex gap-3 rounded-xl border bg-card p-4" aria-label={`Цель: ${goal.title}`}>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg opacity-70", color)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold break-words">{goal.title}</p>
          <span className="shrink-0 text-xs font-semibold text-xp">+{goal.xpReward} XP</span>
        </div>
        <p className="text-xs text-muted-foreground">{goal.description}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${goal.percent}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
          {goal.current}
          {unit} / {goal.target}
          {unit}
        </p>
      </div>
    </div>
  );
}

import { CircleCheck } from "lucide-react";
import { GoalCard } from "@/components/goals/goal-card";
import type { GoalView } from "@/lib/goals/queries";

/** Тренер, «Обзор» клиента: цели клиента (активные с прогрессом и последние выполненные), только чтение. */
export function ClientGoals({
  active,
  achieved,
  today,
  timeZone,
}: {
  active: GoalView[];
  achieved: GoalView[];
  today: string;
  /** Пояс клиента: страница рендерится на сервере, без него даты — в поясе сервера. */
  timeZone: string;
}) {
  if (active.length === 0 && achieved.length === 0) return null;
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone });
  return (
    <section aria-label="Цели клиента" className="space-y-3">
      <h2 className="font-bold">Цели</h2>
      {active.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((g) => (
            <GoalCard key={g.id} goal={g} today={today} readOnly />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Активных целей нет.</p>
      )}
      {achieved.length ? (
        <ul className="space-y-1 text-sm">
          {achieved.map((g) => (
            <li key={g.id} className="flex items-center gap-2">
              <CircleCheck className="size-4 shrink-0 text-xp" />
              <span>{g.title}</span>
              {g.achievedAt ? <span className="text-muted-foreground">· {date.format(g.achievedAt)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

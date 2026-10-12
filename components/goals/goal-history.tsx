import Link from "next/link";
import { CircleCheck, CircleX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { plural } from "@/lib/format";
import type { GoalView } from "@/lib/goals/queries";

function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

/** История целей: выполненные (когда и за сколько дней) и проваленные («пройдено N %», «Поставить снова»). */
export function GoalHistory({ goals, timeZone }: { goals: GoalView[]; /** Пояс пользователя: рендер на сервере. */ timeZone: string }) {
  if (goals.length === 0) return null;
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
  return (
    <section aria-label="История" className="space-y-2">
      <h2 className="font-bold">История</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {goals.map((g) => {
          const done = g.status === "ACHIEVED";
          const at = g.achievedAt ?? g.closedAt;
          const days = at ? daysBetween(g.createdAt, at) : null;
          return (
            <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                {done ? <CircleCheck className="size-4 shrink-0 text-xp" /> : <CircleX className="size-4 shrink-0 text-muted-foreground" />}
                <span className="font-medium">{g.title}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                {done ? (
                  <span>
                    {at ? date.format(at) : null}
                    {days ? ` · за ${days} ${plural(days, "день", "дня", "дней")}` : null}
                  </span>
                ) : (
                  <>
                    <span>Не успел · пройдено {Math.floor(g.progress * 100)} %</span>
                    <Link href={`/goals?again=${g.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      Поставить снова
                    </Link>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

import { unitText } from "@/lib/club/tasks";
import type { ClubTaskView } from "@/lib/club/tasks-queries";
import { plural } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

const when = (t: ClubTaskView) =>
  t.started ? `осталось ${t.daysLeft} ${plural(t.daysLeft, "день", "дня", "дней")}` : `стартует ${dateFormat.format(new Date(t.startsAt))}`;

const amount = (t: ClubTaskView, n: number) =>
  t.type === "HOURS" ? (n / 60).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) : n.toLocaleString("ru-RU");

/** Активные задания на публичной странице клуба: у «всем клубом» — общий прогресс, у «каждому» — только название. */
export function PublicClubTasks({ tasks }: { tasks: ClubTaskView[] }) {
  if (!tasks.length) return null;
  return (
    <section aria-labelledby="tasks" className="mt-8">
      <h2 id="tasks" className="font-display text-xl font-bold">
        Задания клуба
      </h2>
      <ul className="mt-3 space-y-3">
        {tasks.map((t) => {
          const progress = t.mode === "CLUB" ? t.progress : null;
          const pct = progress ? Math.min(100, Math.round((progress.done / progress.target) * 100)) : 0;
          return (
            <li key={t.id} className="space-y-2 rounded-xl border bg-card p-4">
              <div>
                <p className="font-semibold break-words">{t.title}</p>
                <p className="text-xs text-muted-foreground">{when(t)}</p>
              </div>
              {progress ? (
                <div className="space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-sm tabular-nums">
                    {amount(t, progress.done)} / {amount(t, progress.target)}
                    <span className="text-muted-foreground">{unitText(t.type, progress.target).replace(/^[\d\s,]+/, " ")}</span>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

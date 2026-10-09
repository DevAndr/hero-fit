import Link from "next/link";
import { CircleAlert, Flame, TrendingUp } from "lucide-react";
import { clientFlags, lastWorkoutLabel, type ClientRow } from "@/lib/coach/clients";
import { STREAK_WEEK_TARGET } from "@/lib/progress/weekly-streak";

/** Клиенты тренера: метки внимания и сортировка — чистые функции lib/coach/clients.ts. */
export function ClientList({ rows, now }: { rows: ClientRow[]; now: Date }) {
  return (
    <ul aria-label="Клиенты" className="divide-y divide-border/60 rounded-xl border bg-card">
      {rows.map((r) => {
        const flags = clientFlags(r, now);
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <Link href={`/coach/clients/${r.id}`} className="font-semibold hover:text-primary hover:underline">
                {r.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                LVL {r.level} · последняя тренировка: {lastWorkoutLabel(r.lastWorkoutAt, now, r.timeZone)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {flags.inactive ? (
                <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-semibold text-destructive">
                  <CircleAlert className="size-3.5" aria-hidden />
                  7+ дней без тренировок
                </span>
              ) : null}
              {flags.hints ? (
                <span className="flex items-center gap-1 rounded-full bg-xp/10 px-2 py-0.5 font-semibold text-xp">
                  <TrendingUp className="size-3.5" aria-hidden />
                  Пора увеличить вес: {flags.hints}
                </span>
              ) : null}
              <span className="rounded-full bg-muted px-2 py-0.5 tabular-nums">
                {Math.min(r.weekCount, STREAK_WEEK_TARGET)} из {STREAK_WEEK_TARGET} на неделе
              </span>
              <span className="flex items-center gap-1 rounded-full bg-streak/10 px-2 py-0.5 text-streak tabular-nums">
                <Flame className="size-3.5" aria-hidden />
                {r.streak}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import { Flame } from "lucide-react";
import type { RankedMember } from "@/lib/social/league";
import { cn } from "@/lib/utils";

/** Призовые места — кружок с номером в цветах темы (эмодзи медалей на Windows мелкие и размытые). */
const PODIUM: Record<number, string> = {
  1: "bg-xp text-background",
  2: "bg-muted-foreground/70 text-background",
  3: "bg-streak/80 text-background",
};
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

function weekRange(start: string) {
  const end = toDate(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dayMonth.format(toDate(start))} – ${dayMonth.format(end)}`;
}

/** Недельная лига друзей: место, ник, уровень, серия, тренировки, XP (полоска — доля от лидера). */
export function LeagueTable({
  members,
  weekStart,
  previous,
}: {
  members: RankedMember[];
  weekStart: string;
  previous: boolean;
}) {
  const leaderXp = Math.max(1, ...members.map((m) => m.xp));

  return (
    <section aria-label="Недельная лига" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Недельная лига</h2>
          <p className="text-sm text-muted-foreground">
            {weekRange(weekStart)} · XP за тренировки и рекорды
          </p>
        </div>
        <nav aria-label="Неделя" className="flex rounded-lg bg-muted p-0.5 text-sm">
          {[
            { href: "/leaderboard", label: "Эта неделя", active: !previous },
            { href: "/leaderboard?week=prev", label: "Прошлая", active: previous },
          ].map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 transition-colors",
                tab.active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <ol className="mt-4 space-y-1" aria-label="Места">
        {members.map((m) => (
          <li
            key={m.id}
            aria-current={m.me ? "true" : undefined}
            className={cn("rounded-lg px-3 py-2", m.me ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50")}
          >
            <div className="flex items-center gap-3">
              <span className="flex w-7 shrink-0 justify-center" aria-label={`${m.place} место`}>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-black tabular-nums",
                    PODIUM[m.place] ?? "text-muted-foreground",
                  )}
                >
                  {m.place}
                </span>
              </span>
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary uppercase"
              >
                {m.nickname.slice(0, 1) || "?"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {m.nickname || "—"}
                  {m.me ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">это вы</span> : null}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  LVL {m.level}
                  {m.streak > 0 ? (
                    <span className="flex items-center gap-0.5" aria-label={`Серия ${m.streak}`}>
                      <Flame className="size-3 text-streak" aria-hidden />
                      {m.streak}
                    </span>
                  ) : null}
                  <span>· тренировок: {m.workouts}</span>
                </span>
              </span>
              <span className="text-right font-bold text-xp tabular-nums" data-testid="league-xp">
                {m.xp.toLocaleString("ru-RU")} XP
              </span>
            </div>
            <div className="mt-1.5 ml-10 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-xp" style={{ width: `${(m.xp / leaderXp) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

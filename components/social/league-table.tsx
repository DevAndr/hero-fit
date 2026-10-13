import { PlayerAvatar } from "@/components/shop/player-avatar";
import { PlayerName } from "@/components/shop/player-name";
import Link from "next/link";
import { Flame, Swords } from "lucide-react";
import { PlaceBadge } from "@/components/social/place-badge";
import type { RankedMember } from "@/lib/social/league";
import { cn } from "@/lib/utils";

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
              <PlaceBadge place={m.place} xp={m.xp} size={36} />
              <PlayerAvatar nickname={m.nickname} cosmetics={m.cosmetics} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  <PlayerName nickname={m.nickname || "—"} color={m.cosmetics?.nickColor} />
                  {m.me ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">это вы</span> : null}
                </span>
                {m.title ? (
                  <span className="block truncate text-xs text-muted-foreground" data-testid="member-title">
                    {m.title}
                  </span>
                ) : null}
                <span className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  LVL {m.level}
                  {m.streak > 0 ? (
                    <span className="flex items-center gap-0.5" aria-label={`Серия ${m.streak}`}>
                      <Flame className="size-3 text-streak" aria-hidden />
                      {m.streak}
                    </span>
                  ) : null}
                  <span>· тренировок: {m.workouts}</span>
                  {m.bossDefeated ? (
                    <span className="flex items-center gap-0.5 text-streak" title="Босс недели повержен" data-testid="league-boss">
                      <Swords className="size-3" aria-hidden />
                      <span className="sr-only">Босс недели повержен</span>
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-right font-bold text-xp tabular-nums" data-testid="league-xp">
                {m.xp.toLocaleString("ru-RU")} XP
              </span>
            </div>
            <div className="mt-1.5 ml-12 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-xp" style={{ width: `${(m.xp / leaderXp) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

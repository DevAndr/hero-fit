"use client";

import { useState, useTransition } from "react";
import { ArrowBigUpDash, Flame, Loader2, Medal, Swords, Target, Trophy } from "lucide-react";
import { ago, recordText } from "@/components/social/activity-feed";
import { Button } from "@/components/ui/button";
import { loadClubFeedAction } from "@/lib/club/actions";
import type { ClubEvent } from "@/lib/club/feed";
import { weeksText } from "@/lib/progress/streak-copy";
import { cn } from "@/lib/utils";

function highlights(e: ClubEvent) {
  return [
    ...e.achievements.map((t) => ({ icon: Trophy, text: t, className: "text-xp" })),
    ...e.records.map((r) => ({ icon: Medal, text: `Рекорд — ${recordText(r)}`, className: "text-xp" })),
    ...e.goals.map((t) => ({ icon: Target, text: `Цель: ${t}`, className: "text-xp" })),
    ...(e.levelUp ? [{ icon: ArrowBigUpDash, text: `Новый уровень ${e.levelUp}`, className: "text-primary" }] : []),
    ...(e.bossDefeated ? [{ icon: Swords, text: `Босс повержен: ${e.bossDefeated}`, className: "text-streak" }] : []),
    ...(e.streakMilestone ? [{ icon: Flame, text: `${weeksText(e.streakMilestone)} подряд в ударе`, className: "text-streak" }] : []),
  ];
}

/** Лента клуба — только события: тренировки участников незнакомцам не открываются. */
export function ClubFeed({ clubId, initial }: { clubId: string; initial: { events: ClubEvent[]; next: string | null } }) {
  const [events, setEvents] = useState(initial.events);
  const [next, setNext] = useState(initial.next);
  const [pending, start] = useTransition();

  const quiet = <p className="text-sm text-muted-foreground">Пока тихо: здесь появятся ачивки, рекорды и новые уровни участников.</p>;
  if (!events.length && !next) return quiet;
  return (
    <div className="space-y-3">
      {/* Свежие тренировки без событий — текст и «Показать ещё» к более старым */}
      {events.length ? null : quiet}
      <ul aria-label="Лента клуба" className="space-y-2">
        {events.map((e) => (
          <li key={e.key} className={cn("rounded-xl border bg-card p-4", e.me && "border-primary/30")}>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold break-words">{e.me ? "Вы" : e.nickname}</span>
              <span className="text-xs text-muted-foreground">
                <time dateTime={e.finishedAt} suppressHydrationWarning>
                  {ago(e.finishedAt)}
                </time>
                {e.title ? ` · ${e.title}` : null}
              </span>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {highlights(e).map((h, i) => (
                <li key={i} className="flex items-start gap-2">
                  <h.icon className={cn("mt-0.5 size-4 shrink-0", h.className)} aria-hidden />
                  <span className="break-words">{h.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {next ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const page = await loadClubFeedAction(clubId, next);
              setEvents((prev) => [...prev, ...page.events]);
              setNext(page.next);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}

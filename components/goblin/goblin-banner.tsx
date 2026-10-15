"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import goblinSprite from "@/assets/icons/game/bosses/gold_goblin.png";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import { GOBLIN_SETS, goblinProgress } from "@/lib/goblin/rules";
import { haptic } from "@/lib/telegram/webapp";
import { cn } from "@/lib/utils";

/**
 * Золотой гоблин посреди тренировки: таймер 10 минут и «Подходы N/3». Пойман — до конца тренировки висит
 * «Пойман!»; ушёл — можно закрыть. Прогресс считает та же `goblinProgress`, что и сервер при завершении.
 */
export function GoblinBanner({
  spawnedAt,
  sets,
}: {
  spawnedAt: string;
  sets: { completedAt: string | null; isWarmup: boolean; reps: string | number }[];
}) {
  const [now, setNow] = useState(() => Date.now());
  const [closed, setClosed] = useState(false);
  const p = goblinProgress(spawnedAt, sets, now);
  const active = !p.caught && !p.escaped;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  useEffect(() => {
    haptic("success");
  }, [spawnedAt]);
  useEffect(() => {
    if (p.caught) haptic("success");
  }, [p.caught]);

  if (closed) return null;
  return (
    // Живая область — только события (появился, N/3, пойман, ушёл); таймер раз в секунду в неё не входит
    <section
      aria-label="Золотой гоблин"
      className={cn(
        "sticky top-[calc(3.5rem+var(--tg-safe-top)+0.5rem)] z-20 mb-3 flex items-center gap-3 rounded-xl border p-3 shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
        p.escaped ? "border-border bg-card/95" : "border-amber-400/60 bg-amber-400/15",
      )}
    >
      <Image src={goblinSprite} alt="" className={cn("h-14 w-auto shrink-0", p.escaped && "opacity-40 grayscale")} sizes="48px" />
      <div className="min-w-0 flex-1">
        <div role="status">
          <p className="font-bold text-amber-300">
            {p.caught ? "Пойман! Сундук ждёт в итогах тренировки" : p.escaped ? "Гоблин ушёл…" : "Золотой гоблин! 3 подхода за 10 минут"}
          </p>
          {active ? <p className="text-sm text-muted-foreground">Подходы: {p.done}/{GOBLIN_SETS}</p> : null}
        </div>
        {active ? (
          <p role="timer" aria-live="off" aria-label="До побега гоблина" className="text-sm tabular-nums text-muted-foreground">
            <span data-testid="goblin-timer" className="font-mono font-semibold text-foreground">
              {formatClock(Math.ceil(p.leftMs / 1000))}
            </span>
          </p>
        ) : null}
      </div>
      {p.escaped ? (
        <Button size="sm" variant="ghost" onClick={() => setClosed(true)}>
          Закрыть
        </Button>
      ) : null}
    </section>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { BossHpBar } from "@/components/boss/boss-card";
import { BossSprite } from "@/components/boss/boss-sprite";
import { prefersReducedMotion } from "@/components/lottie/lottie-player";
import { setDamage } from "@/lib/boss/damage";
import type { BossView } from "@/lib/boss/queries";

type SetLike = { completedAt: string | null; isWarmup: boolean; rir: number | null; reps: string };

/** Урон выполненных рабочих подходов текущей тренировки (криты — только при завершении). */
function liveDamage(sets: SetLike[]) {
  return sets.reduce((sum, s) => (s.completedAt && !s.isWarmup && Number(s.reps) > 0 ? sum + setDamage(s.rir) : sum), 0);
}

/**
 * Полоса босса в редакторе: HP = HP − урон недели до этой тренировки − урон её выполненных подходов.
 * На удар — босс вздрагивает и всплывает «−N».
 */
export function BossBar({ boss, sets }: { boss: BossView; sets: SetLike[] }) {
  const current = liveDamage(sets);
  const left = Math.max(0, boss.hp - boss.damage - current);
  const defeated = boss.defeatedAt !== null;
  const spriteRef = useRef<HTMLDivElement>(null);

  // «Предыдущее значение» без эффекта: сравниваем при рендере (паттерн из документации React)
  const [prev, setPrev] = useState(current);
  const [hit, setHit] = useState<{ id: number; amount: number } | null>(null);
  if (current !== prev) {
    setPrev(current);
    setHit(current > prev ? { id: (hit?.id ?? 0) + 1, amount: current - prev } : null);
  }

  const animateHit = useCallback((el: HTMLSpanElement | null) => {
    if (!el || prefersReducedMotion()) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(6px) scale(0.8)" },
        { opacity: 1, transform: "translateY(-10px) scale(1.1)", offset: 0.3 },
        { opacity: 0, transform: "translateY(-28px) scale(1)" },
      ],
      { duration: 900, easing: "ease-out", fill: "forwards" },
    );
    spriteRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px) rotate(-6deg)" },
        { transform: "translateX(4px) rotate(6deg)" },
        { transform: "translateX(0)" },
      ],
      { duration: 280 },
    );
  }, []);

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-streak/30 bg-streak/5 p-2" data-testid="boss-bar">
      <div ref={spriteRef} className="relative">
        <BossSprite code={boss.code} defeated={defeated} size={40} />
        {hit ? (
          <span
            key={hit.id}
            ref={animateHit}
            aria-hidden
            className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-sm font-black text-streak tabular-nums opacity-0"
          >
            −{hit.amount}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-semibold">{boss.name}</span>
          <span className="tabular-nums text-muted-foreground" aria-live="polite">
            {left} / {boss.hp} HP
          </span>
        </div>
        <BossHpBar hp={boss.hp} left={left} name={boss.name} className="mt-1 h-2" />
        {defeated ? (
          <p className="mt-1 text-xs font-semibold text-primary">Повержен на этой неделе — подходы идут в зачёт статистики</p>
        ) : left === 0 ? (
          <p className="mt-1 text-xs font-semibold text-streak">Босс на последнем издыхании — заверши тренировку, чтобы добить</p>
        ) : null}
      </div>
    </div>
  );
}

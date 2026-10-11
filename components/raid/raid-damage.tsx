"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { BossSprite } from "@/components/boss/boss-sprite";
import { prefersReducedMotion } from "@/components/lottie/lottie-player";
import type { FinishMeta } from "@/lib/workouts/finish";

/** «Урон по рейд-боссу» в сводке: полоса HP гильдии от «до» к «после», при победе — ссылка за сундуком. */
export function RaidDamage({ raid, readOnly = false }: { raid: NonNullable<FinishMeta["raid"]>; readOnly?: boolean }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const pct = (hp: number) => `${raid.hp ? (hp / raid.hp) * 100 : 0}%`;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const anim = fillRef.current?.animate([{ width: pct(raid.hpBefore) }, { width: pct(raid.hpAfter) }], {
      duration: 900,
      delay: 600,
      easing: "cubic-bezier(0.22, 0.8, 0.25, 1)",
      fill: "backwards",
    });
    return () => anim?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при показе
  }, []);

  return (
    <section className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4" data-testid="raid-damage">
      <div className="flex items-center gap-4">
        <BossSprite code={raid.code} raid defeated={raid.defeated} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-bold">
            <Shield className="size-4 text-destructive" />
            Урон по рейд-боссу: −{raid.damage}
          </h2>
          <div
            role="progressbar"
            aria-label={`Здоровье: ${raid.name}`}
            aria-valuemin={0}
            aria-valuemax={raid.hp}
            aria-valuenow={raid.hpAfter}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div ref={fillRef} className="h-full rounded-full bg-destructive" style={{ width: pct(raid.hpAfter) }} />
          </div>
          <p className="mt-1 text-sm tabular-nums">
            {raid.name}:{" "}
            <span className="whitespace-nowrap">
              {raid.hpAfter} / {raid.hp} HP
            </span>
            {raid.defeated ? (
              <span className="ml-2 font-bold text-primary">Рейд-босс повержен!</span>
            ) : raid.hpBefore === 0 ? (
              <span className="ml-2 text-muted-foreground">Уже повержен гильдией</span>
            ) : null}
          </p>
          {raid.defeated && raid.rewardXp && !readOnly ? (
            <Link href="/guild" className="mt-1 inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline">
              Забрать сундук
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

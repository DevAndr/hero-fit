"use client";

import { useEffect, useRef, useState } from "react";
import { Swords } from "lucide-react";
import { BossSprite } from "@/components/boss/boss-sprite";
import { LottiePlayer, prefersReducedMotion } from "@/components/lottie/lottie-player";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openBossChestAction } from "@/lib/boss/actions";
import { bossName } from "@/lib/boss/bosses";
import { plural } from "@/lib/format";
import type { FinishMeta } from "@/lib/workouts/finish";

/** Блок «Урон боссу» в сводке тренировки: полоса HP едет от «до» к «после», при победе — салют и сундук. */
export function BossDamage({
  boss,
  rewardOpened,
  celebrate,
}: {
  boss: NonNullable<FinishMeta["boss"]>;
  /** Сундук босса уже забран (или босса той недели нет). */
  rewardOpened: boolean;
  /** Салют — только сразу после тренировки. */
  celebrate: boolean;
}) {
  const name = bossName(boss.code);
  const fillRef = useRef<HTMLDivElement>(null);
  const [chestOpen, setChestOpen] = useState(false);
  const [taken, setTaken] = useState(rewardOpened);
  const pct = (hp: number) => `${boss.hp ? (hp / boss.hp) * 100 : 0}%`;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const anim = fillRef.current?.animate([{ width: pct(boss.hpBefore) }, { width: pct(boss.hpAfter) }], {
      duration: 900,
      delay: 300,
      easing: "cubic-bezier(0.22, 0.8, 0.25, 1)",
      fill: "backwards",
    });
    return () => anim?.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- один раз при показе
  }, []);

  return (
    <section className="mt-4 rounded-xl border border-streak/40 bg-streak/5 p-4" data-testid="boss-damage">
      <div className="flex items-center gap-4">
        <div className="relative">
          <BossSprite code={boss.code} defeated={boss.defeated} size={64} />
          {boss.defeated && celebrate ? (
            <LottiePlayer name="celebration" className="pointer-events-none absolute -inset-10" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-bold">
            <Swords className="size-4 text-streak" />
            Урон боссу: −{boss.damage}
            {boss.crits ? (
              <span className="text-sm font-semibold text-streak">
                ({boss.crits} {plural(boss.crits, "крит", "крита", "критов")})
              </span>
            ) : null}
          </h2>
          <div
            role="progressbar"
            aria-label={`Здоровье: ${name}`}
            aria-valuemin={0}
            aria-valuemax={boss.hp}
            aria-valuenow={boss.hpAfter}
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
          >
            <div ref={fillRef} className="h-full rounded-full bg-streak" style={{ width: pct(boss.hpAfter) }} />
          </div>
          <p className="mt-1 text-sm tabular-nums">
            {name}:{" "}
            <span className="whitespace-nowrap">
              {boss.hpAfter} / {boss.hp} HP
            </span>
            {boss.defeated ? (
              <span className="ml-2 font-bold text-primary">Повержен!</span>
            ) : boss.hpBefore === 0 ? (
              <span className="ml-2 text-muted-foreground">Уже повержен на этой неделе</span>
            ) : null}
          </p>
          {boss.defeated && !taken ? (
            <Button size="sm" className="mt-2 bg-amber-400 hover:bg-amber-300" onClick={() => setChestOpen(true)}>
              Открыть сундук босса
            </Button>
          ) : null}
        </div>
      </div>
      <ChestDialog
        open={chestOpen}
        onOpenChange={(next) => setChestOpen(next)}
        title="Сундук босса"
        description={`Награда за победу: ${name}`}
        openedDescription="В понедельник придёт новый босс"
        onOpen={() => openBossChestAction(boss.week)}
        onOpened={() => setTaken(true)}
      />
    </section>
  );
}

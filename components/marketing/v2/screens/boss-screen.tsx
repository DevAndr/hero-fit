"use client";

import Image from "next/image";
import { Swords } from "lucide-react";
import { bossImage } from "@/components/boss/boss-sprite";
import { useLive } from "@/components/marketing/v2/screens/use-live";

const HP_LEFT = 35;

/** Макет «Босс недели»: тоннаж недели бьёт босса — полоса здоровья тает при показе. */
export function BossScreen() {
  const [ref, live] = useLive<HTMLDivElement>();
  const image = bossImage("golem");
  return (
    <div ref={ref} className="flex flex-1 flex-col gap-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
        <Swords className="size-3.5" /> Босс недели
      </p>
      <div className="relative flex flex-1 flex-col items-center justify-center rounded-2xl border bg-linear-to-b from-streak/10 to-card p-4">
        {image ? <Image src={image} alt="" sizes="200px" className="h-auto w-40 drop-shadow-[0_12px_24px_rgb(0_0_0/0.35)]" /> : null}
        <p className="mt-2 font-display text-lg font-bold">Железный Голем</p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-linear-to-r from-streak to-destructive transition-[width] duration-[1800ms] ease-out motion-reduce:transition-none"
            style={{ width: live ? `${HP_LEFT}%` : "100%" }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">Здоровье {live ? HP_LEFT : 100} %</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Твой урон</p>
          <p className="font-display text-lg font-black text-streak tabular-nums">−4 650</p>
        </div>
        <div className="rounded-2xl border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">До конца недели</p>
          <p className="font-display text-lg font-black tabular-nums">3 дня</p>
        </div>
      </div>
    </div>
  );
}

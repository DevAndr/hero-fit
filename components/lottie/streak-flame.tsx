"use client";

import { Flame } from "lucide-react";
import { LottiePlayer } from "@/components/lottie/lottie-player";
import { cn } from "@/lib/utils";

/**
 * Огонь серии: живой (Lottie) — пока серия идёт, иначе статичная иконка.
 * `loop`: true — горит постоянно (крупный огонь в карточке), число — вспыхнуть столько раз и замереть (шапка на каждой странице).
 */
export function StreakFlame({ active, loop = true, className }: { active: boolean; loop?: boolean | number; className?: string }) {
  if (!active) return <Flame aria-hidden className={cn("shrink-0", className)} />;
  return (
    <LottiePlayer
      name="fire"
      loop={loop}
      stillFrame="first"
      fallback={<Flame className="size-full text-streak" />}
      className={cn("shrink-0", className)}
    />
  );
}

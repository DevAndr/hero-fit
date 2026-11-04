"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import base from "@/assets/icons/food/donut_base.png";
import glaze from "@/assets/icons/food/donut_fill.png";
import { useKcalGain } from "@/components/nutrition/use-kcal-gain";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("ru-RU");

/** Дырка пончика в картинках 900×900: центр (445, 457), диаметр ~294 — в долях. */
const HOLE = { left: "49.4%", top: "50.6%", width: "32%", height: "32%" } as const;

const SIZES = {
  md: { px: 200, number: "text-lg", label: "text-[10px]" },
  sm: { px: 120, number: "text-xs", label: null },
} as const;

/**
 * Пончик калорий (флаг nutrition_bar_styles, вид DONUT): на пончике (`donut_base.png`) глазурь (`donut_fill.png`) открывается
 * сектором по часовой от 12 часов — доля нормы (`.donut-glaze`, угол плавно доезжает); сверх нормы — пончик весь в
 * глазури и за ним красное свечение (`.ring-halo`, два вдоха после записи). В дырке — «осталось N» / «+N сверх нормы»
 * с досчётом, «+N» всплывает над пончиком (`useKcalGain`); `role="img"` — та же подпись, что у кольца.
 */
export function DonutRing({ eaten, norm, day, size = "md" }: { eaten: number; norm: number; day: string; size?: keyof typeof SIZES }) {
  const { px, number, label: labelClass } = SIZES[size];
  const { shown, gains, drop } = useKcalGain(eaten, day);
  const overBy = eaten - norm;
  const over = overBy > 0;
  const share = Math.min(1, Math.max(0, eaten / Math.max(1, norm)));
  // Полный круг — с запасом: размытый край сектора не оставляет щели на 12 часах
  const glazeShare = share >= 1 ? 102 : share * 100;
  const shownOver = shown - norm;
  const label = `Съедено ${n(eaten)} из ${n(norm)} ккал, ${over ? `${n(overBy)} сверх нормы` : `осталось ${n(-overBy)}`}`;
  return (
    <div
      role="img"
      aria-label={label}
      data-testid="donut-ring"
      data-over={over || undefined}
      className="relative shrink-0"
      style={{ width: px, height: px }}
    >
      {/* key — съеденное: новая запись перезапускает пульс */}
      {over ? <div key={eaten} aria-hidden data-testid="donut-halo" className="ring-halo [--halo:var(--destructive)]" /> : null}
      <Image src={base} alt="" fill sizes={`${px}px`} className="pointer-events-none select-none" />
      <Image
        src={glaze}
        alt=""
        fill
        sizes={`${px}px`}
        data-testid="donut-glaze"
        className="donut-glaze pointer-events-none select-none"
        style={{ "--donut-share": `${glazeShare.toFixed(2)}%` } as CSSProperties}
      />
      <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center text-center leading-tight" style={HOLE}>
        <span className={cn(number, "font-extrabold tabular-nums", shownOver > 0 && "text-destructive")}>
          {shownOver > 0 ? `+${n(shownOver)}` : n(-shownOver)}
        </span>
        {labelClass ? <span className={cn(labelClass, "text-muted-foreground")}>{shownOver > 0 ? "сверх нормы" : "осталось"}</span> : null}
      </div>
      {gains.map((g) => (
        <span
          key={g.id}
          aria-hidden
          data-testid="donut-gain"
          className={`kcal-gain top-[2%] left-1/2 -translate-x-1/2 text-lg ${g.to > norm ? "text-destructive" : "text-primary"}`}
          onAnimationEnd={() => drop(g.id)}
        >
          +{n(g.amount)}
        </span>
      ))}
    </div>
  );
}

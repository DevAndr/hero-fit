"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import burger from "@/assets/icons/food/burger.png";
import { useKcalGain } from "@/components/nutrition/use-kcal-gain";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("ru-RU");

const SIZES = {
  md: { px: 200, number: "text-lg", label: "text-[10px]" },
  sm: { px: 120, number: "text-xs", label: null },
} as const;

/**
 * Бургер калорий (флаг nutrition_bar_styles, вид BURGER): картинка одна (`burger.png`) — снизу лежит её серая
 * полупрозрачная копия, а цветная открывается снизу вверх по доле нормы (`.burger-fill`, граница плавно доезжает):
 * бургер «собирается» от нижней булки к верхней. Сверх нормы — бургер целый и за ним красное свечение (`.ring-halo`,
 * два вдоха после записи). Под бургером — «осталось N» / «+N сверх нормы» с досчётом, «+N» всплывает над бургером
 * (`useKcalGain`); `role="img"` — та же подпись, что у кольца.
 */
export function BurgerBar({ eaten, norm, day, size = "md" }: { eaten: number; norm: number; day: string; size?: keyof typeof SIZES }) {
  const { px, number, label: labelClass } = SIZES[size];
  const { shown, gains, drop } = useKcalGain(eaten, day);
  const overBy = eaten - norm;
  const over = overBy > 0;
  const share = Math.min(1, Math.max(0, eaten / Math.max(1, norm)));
  // Целый бургер — с запасом: размытая граница не оставляет бледной полоски на верхней булке
  const fillShare = share >= 1 ? 102 : share * 100;
  const shownOver = shown - norm;
  const label = `Съедено ${n(eaten)} из ${n(norm)} ккал, ${over ? `${n(overBy)} сверх нормы` : `осталось ${n(-overBy)}`}`;
  return (
    <div
      role="img"
      aria-label={label}
      data-testid="burger-bar"
      data-over={over || undefined}
      className="relative flex shrink-0 flex-col items-center gap-1"
      style={{ width: px }}
    >
      <div className="relative w-full" style={{ aspectRatio: `${burger.width} / ${burger.height}` }}>
        {/* key — съеденное: новая запись перезапускает пульс */}
        {over ? <div key={eaten} aria-hidden data-testid="burger-halo" className="ring-halo [--halo:var(--destructive)]" /> : null}
        <Image src={burger} alt="" fill sizes={`${px}px`} className="pointer-events-none opacity-25 grayscale select-none" />
        <Image
          src={burger}
          alt=""
          fill
          sizes={`${px}px`}
          data-testid="burger-fill"
          className="burger-fill pointer-events-none select-none"
          style={{ "--burger-share": `${fillShare.toFixed(2)}%` } as CSSProperties}
        />
        {gains.map((g) => (
          <span
            key={g.id}
            aria-hidden
            data-testid="burger-gain"
            className={`kcal-gain top-[2%] left-1/2 -translate-x-1/2 text-lg ${g.to > norm ? "text-destructive" : "text-primary"}`}
            onAnimationEnd={() => drop(g.id)}
          >
            +{n(g.amount)}
          </span>
        ))}
      </div>
      <div className="flex flex-col items-center text-center leading-tight">
        <span className={cn(number, "font-extrabold tabular-nums", shownOver > 0 && "text-destructive")}>
          {shownOver > 0 ? `+${n(shownOver)}` : n(-shownOver)}
        </span>
        {labelClass ? <span className={cn(labelClass, "text-muted-foreground")}>{shownOver > 0 ? "сверх нормы" : "осталось"}</span> : null}
      </div>
    </div>
  );
}

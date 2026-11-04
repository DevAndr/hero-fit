"use client";

import Image from "next/image";
import frame from "@/assets/icons/food/base_base_progress_bar.png";
import potion from "@/assets/icons/food/fill_progress_bar.png";
import spill from "@/assets/icons/food/over_fill_progress_bar.png";
import { useKcalGain } from "@/components/nutrition/use-kcal-gain";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("ru-RU");

/**
 * Жёлоб котла внутри `base_base_progress_bar.png` (1331×354): x 175…1215, y 100…248 — в долях картинки.
 * Картинка «перелива» (1476×481) нарисована крупнее (×1,087) и со сдвигом — подогнана к рамке базовой.
 */
const CHANNEL = {
  left: "13.15%",
  right: "8.6%",
  top: "28.2%",
  bottom: "29.9%",
} as const;
const SPILL = {
  left: "0.4%",
  top: "-4.9%",
  width: "102%",
  height: "125%",
} as const;

/**
 * Котёл калорий (флаг `nutrition_cauldron`) — вместо кольца в «Итоге дня» на /nutrition: зелье в жёлобе — съеденное от
 * нормы, сверх нормы — зелье переливается через край (`over_fill_progress_bar.png`). Внутри — «осталось N» / «+N сверх
 * нормы» с досчётом, добавленные ккал всплывают «+N» над котлом (`useKcalGain`, как у кольца).
 */
export function CauldronBar({ eaten, norm, day }: { eaten: number; norm: number; day: string }) {
  const { shown, gains, drop } = useKcalGain(eaten, day);
  const overBy = eaten - norm;
  const over = overBy > 0;
  const share = Math.min(1, Math.max(0, eaten / Math.max(1, norm)));
  const shownOver = shown - norm;
  const label = `Съедено ${n(eaten)} из ${n(norm)} ккал, ${over ? `${n(overBy)} сверх нормы` : `осталось ${n(-overBy)}`}`;
  return (
    // Перелив выходит за рамку снизу — запас под лужу
    <div className={cn("w-full", over && "pb-[6%]")}>
      <div role="img" aria-label={label} data-testid="cauldron-bar" data-over={over || undefined} className="relative aspect-1331/354 w-full">
        {/* Пустой котёл с зельем; при переливе уступает место картинке перелива (иначе из-под неё виден обод) */}
        <div className={cn("absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none", over && "opacity-0")}>
          <Image src={frame} alt="" fill sizes="(min-width: 640px) 560px, 100vw" className="pointer-events-none select-none" priority />
          <div className="absolute overflow-hidden rounded-full" style={CHANNEL}>
            <Image
              src={potion}
              alt=""
              fill
              sizes="(min-width: 640px) 440px, 80vw"
              data-testid="cauldron-fill"
              className="pointer-events-none object-fill transition-[clip-path] duration-700 ease-out select-none motion-reduce:transition-none"
              // Скруглённый край — фронт зелья, а не срез
              style={{
                clipPath: `inset(0 ${((1 - share) * 100).toFixed(2)}% 0 0 round 0 9999px 9999px 0)`,
              }}
            />
          </div>
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
            over ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
          style={SPILL}
        >
          {/* eager — перелив после записи показывается сразу, без догрузки */}
          <Image src={spill} alt="" fill sizes="(min-width: 640px) 580px, 100vw" loading="eager" className="select-none" />
        </div>
        <div className="absolute flex items-center justify-center gap-1.5 text-white" style={CHANNEL}>
          <span className="text-lg font-extrabold tabular-nums [text-shadow:0_1px_3px_rgb(0_0_0/0.9)] sm:text-2xl">
            {shownOver > 0 ? `+${n(shownOver)}` : n(-shownOver)}
          </span>
          <span className="text-xs font-semibold [text-shadow:0_1px_3px_rgb(0_0_0/0.9)] sm:text-sm">{shownOver > 0 ? "сверх нормы" : "осталось"}</span>
        </div>
        {/* «+N» поднимается из горловины котла */}
        {gains.map((g) => (
          <span
            key={g.id}
            aria-hidden
            data-testid="cauldron-gain"
            className={`kcal-gain top-[-6%] left-[20%] -translate-x-1/2 text-lg ${g.to > norm ? "text-destructive" : "text-primary"}`}
            onAnimationEnd={() => drop(g.id)}
          >
            +{n(g.amount)}
          </span>
        ))}
      </div>
    </div>
  );
}

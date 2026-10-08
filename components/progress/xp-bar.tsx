"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Point = { level: number; percent: number };

const SIZES = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-3.5",
} as const;

const EASE = "cubic-bezier(0.22, 0.8, 0.25, 1)";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Полоса опыта: заливка с бликом и «искрой» на конце.
 * При появлении заполняется от `from` (по умолчанию — 0 % текущего уровня); при смене значения
 * доезжает до нового, а если уровень вырос — заполняется до конца, вспыхивает и начинает заново
 * (столько раз, сколько уровней взято). «Уменьшить движение» — сразу итоговое значение.
 */
export function XpBar({
  level,
  percent,
  from,
  size = "md",
  delay = 0,
  label,
  className,
}: {
  level: number;
  percent: number;
  /** С какого места анимировать при первом показе (например, XP до тренировки). */
  from?: Point;
  size?: keyof typeof SIZES;
  /** Задержка старта первой анимации, мс. */
  delay?: number;
  label: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const shown = useRef<Point | null>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const track = trackRef.current;
    if (!fill || !track) return;
    const start = shown.current ?? from ?? { level, percent: 0 };
    const target = { level, percent };
    shown.current = target;

    const set = (p: number) => {
      fill.style.width = `${p}%`;
    };
    if (reducedMotion() || (start.level === target.level && start.percent === target.percent)) {
      set(target.percent);
      return;
    }

    let cancelled = false;
    const running: Animation[] = [];
    const run = async (keyframes: Keyframe[], options: KeyframeAnimationOptions, el: HTMLElement = fill) => {
      const a = el.animate(keyframes, { fill: "forwards", ...options });
      running.push(a);
      await a.finished;
    };

    const levelUps = Math.max(0, target.level - start.level);
    (async () => {
      try {
        let at = levelUps > 0 || target.percent >= start.percent ? start.percent : 0;
        set(at);
        let wait = delay;
        for (let i = 0; i < levelUps; i++) {
          await run([{ width: `${at}%` }, { width: "100%" }], { duration: 500 + (100 - at) * 6, delay: wait, easing: EASE });
          wait = 0;
          if (cancelled) return;
          set(100);
          await run(
            [
              { boxShadow: "0 0 0 0 var(--xp)", filter: "brightness(1)" },
              { boxShadow: "0 0 18px 4px var(--xp)", filter: "brightness(1.6)" },
              { boxShadow: "0 0 0 0 transparent", filter: "brightness(1)" },
            ],
            { duration: 550, easing: "ease-out", fill: "none" },
            track,
          );
          if (cancelled) return;
          at = 0;
          set(0);
        }
        await run([{ width: `${at}%` }, { width: `${target.percent}%` }], {
          duration: 450 + Math.abs(target.percent - at) * 9,
          delay: wait,
          easing: EASE,
        });
        if (!cancelled) set(target.percent);
      } catch {
        // AbortError — анимацию отменили при размонтировании
      } finally {
        for (const a of running) a.cancel();
      }
    })();

    return () => {
      cancelled = true;
      for (const a of running) a.cancel();
      // Прерванную анимацию (StrictMode, смена значения на лету) следующий запуск проигрывает заново с начала
      shown.current = start;
      set(start.percent);
    };
    // from и delay важны только для первого показа
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, percent]);

  return (
    <div
      ref={trackRef}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("xp-track relative overflow-hidden rounded-full bg-muted", SIZES[size], className)}
    >
      <div
        ref={fillRef}
        className="xp-fill relative h-full rounded-full"
        style={{ width: `${(from ?? { percent: 0 }).percent}%` }}
      >
        <span aria-hidden className="xp-shine absolute inset-0 rounded-full" />
        {size !== "sm" ? <span aria-hidden className="xp-spark absolute top-1/2 right-0 rounded-full" /> : null}
      </div>
    </div>
  );
}

"use client";

import { useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { LottiePlayer } from "@/components/lottie/lottie-player";
import { XpBar } from "@/components/progress/xp-bar";

/** Залпы салюта: место на экране, размер и задержка (мс). */
const VOLLEYS = [
  { left: "50%", top: "45%", size: "min(90vw, 640px)", delay: 0 },
  { left: "22%", top: "30%", size: "min(60vw, 420px)", delay: 250 },
  { left: "78%", top: "32%", size: "min(60vw, 420px)", delay: 500 },
  { left: "50%", top: "25%", size: "min(70vw, 480px)", delay: 800 },
];

/** Полоса опыта, которая в момент нового уровня запускает салют поверх страницы (если celebrate). */
export function LevelUpBar({ celebrate, ...props }: Omit<ComponentProps<typeof XpBar>, "onLevelUp"> & { celebrate: boolean }) {
  const [bursts, setBursts] = useState<number[]>([]);
  return (
    <>
      <XpBar {...props} onLevelUp={celebrate ? () => setBursts((b) => [...b, Date.now()]) : undefined} />
      {bursts.length
        ? createPortal(
            <div aria-hidden data-testid="level-up-celebration" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
              {bursts.flatMap((id) =>
                VOLLEYS.map((v, i) => (
                  <LottiePlayer
                    key={`${id}-${i}`}
                    name="celebration"
                    delay={v.delay}
                    onComplete={i === VOLLEYS.length - 1 ? () => setBursts((b) => b.filter((x) => x !== id)) : undefined}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: v.left, top: v.top, width: v.size, height: v.size }}
                  />
                )),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

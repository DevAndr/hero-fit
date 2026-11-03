"use client";

import { useEffect, useRef, useState } from "react";

const n = (v: number) => v.toLocaleString("ru-RU");
const COUNT_MS = 600;

type Gain = { id: string; amount: number; over: boolean };

/**
 * Середина кольца на /nutrition: «осталось» сбегает к новому значению, а добавленные ккал всплывают «+N», как урон в играх.
 * Только рост «съедено» в пределах дня `day`: удаление, правка вниз и смена дня — сразу и без цифры.
 */
export function RingCenter({ eaten, norm, day, numberClass }: { eaten: number; norm: number; day: string; numberClass: string }) {
  const [prev, setPrev] = useState({ day, eaten });
  const [gains, setGains] = useState<Gain[]>([]);
  // Новое «съедено» с сервера — цифра считается прямо в рендере (без лишнего прохода эффекта)
  if (prev.day !== day || prev.eaten !== eaten) {
    setPrev({ day, eaten });
    if (prev.day === day && eaten > prev.eaten) {
      setGains((g) => [...g, { id: `${day}:${prev.eaten}:${eaten}`, amount: eaten - prev.eaten, over: eaten > norm }]);
    }
  }

  const [shown, setShown] = useState(eaten);
  const shownRef = useRef(eaten);
  const dayRef = useRef(day);
  useEffect(() => {
    const from = shownRef.current;
    const instant = dayRef.current !== day || eaten < from || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dayRef.current = day;
    if (from === eaten) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = instant ? 1 : Math.min(1, (t - start) / COUNT_MS);
      const v = Math.round(from + (eaten - from) * (1 - (1 - k) ** 3));
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [eaten, day]);

  const overBy = shown - norm;
  return (
    <>
      <span className={overBy > 0 ? `${numberClass} font-extrabold tabular-nums text-destructive` : `${numberClass} font-extrabold tabular-nums`}>
        {overBy > 0 ? `+${n(overBy)}` : n(-overBy)}
      </span>
      <span className="text-xs text-muted-foreground">{overBy > 0 ? "сверх нормы" : "осталось"}</span>
      {gains.map((g) => (
        <span
          key={g.id}
          aria-hidden
          data-testid="ring-gain"
          className={g.over ? "ring-gain text-destructive" : "ring-gain text-primary"}
          onAnimationEnd={() => setGains((all) => all.filter((x) => x.id !== g.id))}
        >
          +{n(g.amount)}
        </span>
      ))}
    </>
  );
}

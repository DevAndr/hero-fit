"use client";

import { useEffect, useRef, useState } from "react";

const COUNT_MS = 600;

export type KcalGain = { id: string; amount: number; to: number };

/**
 * Ккал, растущие от новой записи: `shown` досчитывает к `value` за 0,6 с, `gains` — всплывающие «+N» (убрать — `drop` по концу анимации).
 * Только рост в пределах дня `day`: удаление, правка вниз и смена дня — сразу и без «+N»; с «уменьшить движение» — без досчёта.
 */
export function useKcalGain(value: number, day: string) {
  const [prev, setPrev] = useState({ day, value });
  const [gains, setGains] = useState<KcalGain[]>([]);
  // Новое значение с сервера — «+N» считается прямо в рендере (без лишнего прохода эффекта)
  if (prev.day !== day || prev.value !== value) {
    setPrev({ day, value });
    if (prev.day === day && value > prev.value) {
      setGains((g) => [...g, { id: `${day}:${prev.value}:${value}`, amount: value - prev.value, to: value }]);
    }
  }

  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const dayRef = useRef(day);
  useEffect(() => {
    const from = shownRef.current;
    const instant = dayRef.current !== day || value < from || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dayRef.current = day;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = instant ? 1 : Math.min(1, (t - start) / COUNT_MS);
      const v = Math.round(from + (value - from) * (1 - (1 - k) ** 3));
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, day]);

  const drop = (id: string) => setGains((all) => all.filter((g) => g.id !== id));
  return { shown, gains, drop };
}

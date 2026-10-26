"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { Check, Timer } from "lucide-react";
import { useLive } from "@/components/marketing/v2/screens/use-live";
import { cn } from "@/lib/utils";

const SETS = [
  { w: 80, r: 8 },
  { w: 90, r: 6 },
  { w: 100, r: 5 },
];
const REST = 90;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Макет тренировки: третий подход отмечается, таймер отдыха тикает — только пока макет виден. */
export function WorkoutScreen() {
  const [ref, live, reduce] = useLive<HTMLDivElement>();
  const visibleRef = useRef<HTMLDivElement>(null);
  const visible = useInView(visibleRef);
  const [left, setLeft] = useState(REST);
  useEffect(() => {
    if (!live || reduce || !visible) return;
    const id = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : REST)), 1000);
    return () => window.clearInterval(id);
  }, [live, reduce, visible]);

  return (
    <div ref={ref} className="flex flex-1 flex-col gap-3">
      <div ref={visibleRef}>
        <p className="text-[11px] text-muted-foreground tabular-nums">Тренировка · 24:18</p>
        <p className="font-display text-base font-bold">Ноги</p>
      </div>
      <div className="rounded-2xl border bg-card p-3.5">
        <p className="font-semibold">Приседания со штангой</p>
        <p className="text-[11px] text-muted-foreground">Прошлый раз: 95 кг × 5</p>
        <ul className="mt-2.5 grid gap-1.5">
          {SETS.map((s, i) => {
            const done = i < 2 || live;
            return (
              <li key={i} className={cn("flex items-center gap-3 rounded-lg px-1.5 py-1", i === 2 && "bg-primary/10")}>
                <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1 tabular-nums">
                  {s.w} кг × {s.r}
                </span>
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border transition-colors duration-500 motion-reduce:transition-none",
                    done && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {done ? <Check className="size-4" /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 p-3.5">
        <span className="flex items-center gap-2 font-semibold text-primary">
          <Timer className="size-4" /> Отдых
        </span>
        <span className="font-display text-2xl font-black tabular-nums">{clock(left)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
        <span className="rounded-xl border bg-card py-2">−15 с</span>
        <span className="rounded-xl border bg-card py-2">+15 с</span>
        <span className="rounded-xl border bg-card py-2">Пропустить</span>
      </div>
      <div className="mt-auto rounded-2xl border bg-card p-3 text-[11px] text-muted-foreground">
        Следующее: <span className="font-semibold text-foreground">Румынская тяга · 3 × 10</span>
      </div>
    </div>
  );
}

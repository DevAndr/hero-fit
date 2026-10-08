"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { Check, Flame, Timer, Trophy } from "lucide-react";
import { LevelHud } from "@/components/marketing/infographics";

const SETS = [
  { w: 80, r: 8 },
  { w: 90, r: 6 },
  { w: 100, r: 5 },
  { w: 100, r: 5 },
];
/** Сколько подходов отмечено в финале сцены (4-й остаётся «следующим»). */
const DONE = 3;
const START_SEC = 42 * 60 + 18;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const SPRING = { type: "spring", stiffness: 320, damping: 18 } as const;

/** Герой лендинга: «экран тренировки» — подходы отмечаются по очереди, после рекорда всплывают XP и серия. */
export function HeroHud() {
  const reduce = useReducedMotion();
  const [done, setDone] = useState(reduce ? DONE : 0);
  const [elapsed, setElapsed] = useState(START_SEC);

  useEffect(() => {
    if (reduce) return;
    const timers = Array.from({ length: DONE }, (_, i) => setTimeout(() => setDone(i + 1), 700 + i * 650));
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(tick);
    };
  }, [reduce]);

  const record = done >= DONE;

  return (
    <div aria-hidden className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -inset-10 -z-10 rounded-full bg-primary/20 blur-3xl" />
      <m.div
        className="rounded-2xl border bg-card/95 p-5 pb-16 shadow-2xl backdrop-blur"
        initial={{ opacity: 0, y: 24, rotate: -1.5 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.8, delay: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground tabular-nums">Тренировка · {clock(elapsed)}</p>
            <p className="font-display text-lg font-bold">Грудь и трицепс</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
            <Timer className="size-3.5" /> отдых 1:12
          </span>
        </div>
        <div className="mt-4 rounded-xl border bg-background/60 p-3">
          <p className="font-semibold">Жим штанги лёжа</p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {SETS.map((s, i) => {
              const isDone = i < done;
              const next = i === done;
              return (
                <m.li
                  key={i}
                  className="flex items-center gap-3 rounded-md"
                  animate={{ backgroundColor: next ? "color-mix(in oklch, var(--primary) 8%, transparent)" : "rgba(0,0,0,0)" }}
                >
                  <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className={isDone ? "flex-1 tabular-nums" : "flex-1 text-muted-foreground tabular-nums"}>
                    {s.w} кг × {s.r}
                  </span>
                  <span className="relative flex size-6 items-center justify-center rounded-md border">
                    <AnimatePresence>
                      {isDone ? (
                        <m.span
                          key="ok"
                          className="absolute inset-0 flex items-center justify-center rounded-md bg-primary text-primary-foreground"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={SPRING}
                        >
                          <Check className="size-4" />
                        </m.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                </m.li>
              );
            })}
          </ul>
        </div>
      </m.div>

      <LevelHud className="absolute -bottom-12 left-3 w-52 sm:-left-8 sm:w-56" delay={reduce ? 0 : 2.4} />

      <AnimatePresence>
        {record ? (
          <m.div
            key="pr"
            className="absolute -top-12 left-3 sm:left-1/3 sm:-top-10"
            initial={{ opacity: 0, y: 16, scale: 0.8 }}
            animate={{ opacity: 1, y: [16, 0, -6, 0], scale: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2 rounded-xl border bg-card/95 px-3 py-2 shadow-lg">
              <m.span animate={{ rotate: [0, -14, 12, -6, 0] }} transition={{ duration: 0.8, delay: 0.3 }}>
                <Trophy className="size-5 text-xp" />
              </m.span>
              <div className="text-xs">
                <p className="font-semibold">Новый рекорд!</p>
                <p className="text-muted-foreground">Жим 100 кг · +25 XP</p>
              </div>
            </div>
          </m.div>
        ) : null}
        {record ? (
          <m.div
            key="streak"
            className="absolute -top-4 right-3 flex items-center gap-1.5 rounded-full border bg-card/95 px-3 py-1.5 text-sm font-semibold shadow-lg sm:top-auto sm:-right-6 sm:-bottom-5"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SPRING, delay: 0.5 }}
          >
            <Flame className="hf-flicker size-4 text-streak" /> 4 недели в ударе
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

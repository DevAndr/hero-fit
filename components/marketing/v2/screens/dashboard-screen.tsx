"use client";

import { CalendarDays, Dumbbell, Flame, Play, Trophy } from "lucide-react";
import { CountUp } from "@/components/marketing/motion";
import { useLive } from "@/components/marketing/v2/screens/use-live";
import { cn } from "@/lib/utils";

const XP_PCT = 68;
const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TRAINED = new Set([0, 2]);

/** Макет дашборда: уровень и полоса XP, серия недель, неделя и главная кнопка. */
export function DashboardScreen() {
  const [ref, live] = useLive<HTMLDivElement>();
  return (
    <div ref={ref} className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">Привет,</p>
          <p className="font-display text-base font-bold">Герой</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-streak/15 px-2 py-1 text-[11px] font-semibold text-streak">
          <Flame className="size-3.5" /> 6 недель
        </span>
      </div>

      <div className="rounded-2xl border bg-card p-3.5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Уровень</p>
            <p className="font-display text-3xl leading-none font-black">
              <CountUp value={12} from={11} />
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">1 240 / 1 820 XP</p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            data-testid="hero-xp-bar"
            className="h-full rounded-full bg-linear-to-r from-xp/80 to-xp transition-[width] duration-[1600ms] ease-out motion-reduce:transition-none"
            style={{ width: live ? `${XP_PCT}%` : "0%" }}
          />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <CalendarDays className="size-3.5" /> Неделя · 2 из 3 тренировок
        </p>
        <div className="mt-2.5 grid grid-cols-7 gap-1">
          {WEEK.map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg border text-[10px]",
                  TRAINED.has(i) ? "border-primary bg-primary text-primary-foreground" : i === 4 ? "border-dashed border-primary/60" : "bg-muted/50",
                )}
              >
                {TRAINED.has(i) ? <Dumbbell className="size-3.5" /> : null}
              </span>
              <span className="text-[9px] text-muted-foreground">{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl border bg-card p-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-xp/15 text-xp">
          <Trophy className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">Клуб сотки: присед</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[92%] rounded-full bg-xp" />
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground tabular-nums">92%</span>
      </div>

      <div className="mt-auto flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)]">
        <Play className="size-4" /> Начать тренировку
      </div>
    </div>
  );
}

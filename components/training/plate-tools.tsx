"use client";

import { useState, type Dispatch } from "react";
import { Disc3, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Action, ExerciseState } from "@/components/training/workout-state";
import { BAR_KG, platesFor, warmupSets, WARMUP_MIN_KG } from "@/lib/progress/plates";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const parse = (v: string) => Number(v.replace(",", ".")) || 0;

/** Как на настоящей штанге: высота и цвет по весу блина (цвета IWF через токены темы), подпись — всегда. */
const PLATE_STYLE: Record<number, string> = {
  25: "h-14 bg-chart-5 text-background",
  20: "h-13 bg-chart-2 text-background",
  15: "h-12 bg-chart-3 text-background",
  10: "h-10 bg-chart-1 text-background",
  5: "h-8 bg-muted-foreground text-background",
  2.5: "h-7 bg-muted-foreground/70 text-background",
  1.25: "h-6 bg-muted-foreground/50 text-foreground",
};

function PlateLoadout({ target }: { target: number }) {
  const load = platesFor(target);
  if (!load) {
    return <p className="text-sm text-muted-foreground">{fmt(target)} кг — это пустой гриф ({BAR_KG} кг) или меньше.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="font-semibold">{fmt(target)} кг</span>
        <span className="text-muted-foreground">
          {" "}
          — на каждую сторону: {load.perSide.map(fmt).join(" + ")} (гриф {BAR_KG} кг)
        </span>
      </p>
      {!load.exact ? (
        <p className="text-xs text-muted-foreground">Ровно не собрать — ближайший вес {fmt(load.total)} кг</p>
      ) : null}
      {/* Одна сторона штанги: втулка → блины от тяжёлого к лёгкому */}
      <div className="flex items-center gap-0.5" aria-hidden>
        <span className="h-3 w-10 rounded-l-sm bg-border" />
        <span className="h-5 w-1.5 rounded-sm bg-muted-foreground/60" />
        {load.perSide.map((plate, i) => (
          <span
            key={i}
            className={cn(
              "flex w-6 items-center justify-center rounded-sm text-[9px] font-bold [writing-mode:vertical-rl]",
              PLATE_STYLE[plate],
            )}
          >
            {fmt(plate)}
          </span>
        ))}
        <span className="h-3 w-6 rounded-r-sm bg-border" />
      </div>
    </div>
  );
}

/** «Разминка» и «Блины» под подходами упражнения с весом. Цель — ближайший невыполненный рабочий подход. */
export function PlateTools({ item, dispatch }: { item: ExerciseState; dispatch: Dispatch<Action> }) {
  const [open, setOpen] = useState(false);
  const working = item.sets.filter((s) => !s.isWarmup);
  const next = working.find((s) => !s.completedAt && parse(s.weight) > 0) ?? working.find((s) => parse(s.weight) > 0);
  const target = next ? parse(next.weight) : 0;
  const heaviest = Math.max(0, ...working.map((s) => parse(s.weight)));
  const plan = warmupSets(heaviest);

  return (
    <div className="mt-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          disabled={plan.length === 0}
          title={plan.length ? undefined : `Разминка — для рабочего веса от ${WARMUP_MIN_KG} кг`}
          onClick={() => dispatch({ type: "setWarmup", key: item.key, sets: plan })}
        >
          <Flame />
          Разминка
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="flex-1 text-muted-foreground"
          aria-expanded={open}
          disabled={target === 0}
          onClick={() => setOpen((v) => !v)}
        >
          <Disc3 />
          Блины
        </Button>
      </div>
      {open && target > 0 ? (
        <div role="region" aria-label="Блины на штанге" className="mt-1 rounded-lg border bg-muted/30 p-3">
          <PlateLoadout target={target} />
        </div>
      ) : null}
    </div>
  );
}

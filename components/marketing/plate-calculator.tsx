"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { parseNumber } from "@/components/training/workout-state";
import { BAR_KG, platesFor, warmupSets } from "@/lib/progress/plates";
import { cn } from "@/lib/utils";

const BARS = [20, 15, 10];
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Цвет и размер блина — как в зале: 25 красный, 20 синий, 15 жёлтый, 10 зелёный (токены графиков). */
const PLATE_STYLE: Record<number, string> = {
  25: "h-28 bg-chart-5",
  20: "h-28 bg-chart-2",
  15: "h-24 bg-chart-3",
  10: "h-20 bg-chart-1",
  5: "h-16 bg-foreground/70",
  2.5: "h-12 bg-chart-5/70",
  1.25: "h-10 bg-muted-foreground",
};

function Barbell({ plates }: { plates: number[] }) {
  const side = (mirror: boolean) => (
    <div className={cn("flex items-center gap-0.5", mirror && "flex-row-reverse")}>
      {plates.map((p, i) => (
        <span key={i} className={cn("w-3 rounded-sm sm:w-4", PLATE_STYLE[p])} title={`${fmt(p)} кг`} />
      ))}
    </div>
  );
  return (
    <div aria-hidden className="flex h-32 items-center justify-center">
      <span className="h-3 w-6 rounded-l bg-muted-foreground/60" />
      {side(true)}
      <span className="h-2 w-24 bg-muted-foreground/60 sm:w-40" />
      {side(false)}
      <span className="h-3 w-6 rounded-r bg-muted-foreground/60" />
    </div>
  );
}

export function PlateCalculator() {
  const [target, setTarget] = useState("100");
  const [bar, setBar] = useState(BAR_KG);
  const weight = parseNumber(target);
  const load = weight > 0 ? platesFor(weight, bar) : null;
  const warmup = warmupSets(weight, bar);

  return (
    <section aria-label="Калькулятор блинов" className="card-glow rounded-2xl border p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Вес на штанге, кг</span>
          <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="100" />
        </label>
        <fieldset className="space-y-1 text-sm">
          <legend className="text-muted-foreground">Гриф</legend>
          <div className="flex gap-2">
            {BARS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={bar === b}
                onClick={() => setBar(b)}
                className={cn("h-8 flex-1 rounded-lg border text-sm font-semibold", bar === b ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                {b} кг
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-6">
        {load ? (
          <>
            <Barbell plates={load.perSide} />
            <p className="mt-2 text-sm text-muted-foreground">На каждую сторону</p>
            <p className="text-2xl font-black" data-testid="plates-per-side">
              {load.perSide.map(fmt).join(" + ")} кг
            </p>
            {!load.exact ? (
              <p className="mt-1 text-sm text-streak">Ровно {fmt(weight)} кг не собрать — ближайший вес {fmt(load.total)} кг</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{weight > 0 ? `Вес не больше грифа (${bar} кг) — блины не нужны` : "Введите вес"}</p>
        )}
      </div>

      {warmup.length ? (
        <div className="mt-6">
          <h2 className="font-bold">Разминка к рабочему весу</h2>
          <ol className="mt-2 grid gap-1 text-sm tabular-nums" data-testid="warmup">
            {warmup.map((s, i) => (
              <li key={i} className="flex justify-between border-t border-border/50 py-1.5">
                <span>Подход {i + 1}</span>
                <span className="font-semibold">
                  {fmt(s.weight)} кг × {s.reps}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useKcalGain } from "@/components/nutrition/use-kcal-gain";

const n = (v: number) => v.toLocaleString("ru-RU");

/** Середина кольца на /nutrition: «осталось» сбегает к новому значению, а добавленные ккал всплывают «+N», как урон в играх. */
export function RingCenter({ eaten, norm, day, numberClass }: { eaten: number; norm: number; day: string; numberClass: string }) {
  const { shown, gains, drop } = useKcalGain(eaten, day);
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
          // Запись вывела за норму — красным
          className={`kcal-gain top-[14%] left-1/2 -translate-x-1/2 text-lg ${g.to > norm ? "text-destructive" : "text-primary"}`}
          onAnimationEnd={() => drop(g.id)}
        >
          +{n(g.amount)}
        </span>
      ))}
    </>
  );
}

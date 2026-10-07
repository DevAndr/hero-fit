"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { HeatCell } from "@/lib/stats/series";
import { cn } from "@/lib/utils";

/** Один оттенок, светлее → темнее = больше объём (последовательная шкала). */
const LEVEL_CLASS: Record<HeatCell["level"], string> = {
  0: "bg-muted",
  1: "bg-[color-mix(in_oklch,var(--chart-1)_30%,var(--card))]",
  2: "bg-[color-mix(in_oklch,var(--chart-1)_55%,var(--card))]",
  3: "bg-[color-mix(in_oklch,var(--chart-1)_80%,var(--card))]",
  4: "bg-chart-1",
};

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const month = new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });
const kg = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} кг`;
const ROW_LABELS = ["Пн", "", "Ср", "", "Пт", "", ""];

function describe(cell: HeatCell) {
  const date = fullDate.format(toDate(cell.day));
  if (!cell.workouts) return `${date} — без тренировок`;
  return `${date} — ${kg(cell.volume)} · тренировок: ${cell.workouts}`;
}

export function ActivityHeatmap({ columns }: { columns: HeatCell[][] }) {
  const [hovered, setHovered] = useState<HeatCell | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cells = columns.flat().filter((c) => !c.future);
  const activeDays = cells.filter((c) => c.workouts > 0).length;

  // На узком экране показываем самые свежие недели (прокрутка к правому краю).
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <section aria-label="Календарь активности" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Календарь активности</h2>
          <p className="text-sm text-muted-foreground">
            Тренировочных дней за {columns.length} недель: <span className="font-semibold text-foreground">{activeDays}</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
          Меньше
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span key={l} className={cn("size-3 rounded-[3px]", LEVEL_CLASS[l])} />
          ))}
          Больше
        </div>
      </div>

      <div ref={scroller} className="mt-4 overflow-x-auto pb-1" aria-hidden>
        {/* Одна сетка: колонка подписей + недели. На телефоне ячейка 14px (прокрутка), на ПК — тянется до 28px. */}
        <div
          style={{ "--weeks": columns.length } as CSSProperties}
          className="grid w-max grid-flow-col grid-cols-[auto_repeat(var(--weeks),14px)] grid-rows-[16px_repeat(7,auto)] gap-0.75 lg:w-full lg:grid-cols-[auto_repeat(var(--weeks),minmax(0,28px))]"
        >
          <span />
          {ROW_LABELS.map((label, i) => (
            <span key={i} className="flex items-center pr-1 text-[10px] text-muted-foreground">
              {label}
            </span>
          ))}
          {columns.map((week, w) => {
            const first = week[0].day;
            const newMonth = w === 0 || toDate(first).getUTCMonth() !== toDate(columns[w - 1][0].day).getUTCMonth();
            return [
              <span key={`m${first}`} className="overflow-visible whitespace-nowrap text-[10px] leading-4 text-muted-foreground">
                {newMonth ? month.format(toDate(first)) : ""}
              </span>,
              ...week.map((cell) => (
                <span
                  key={cell.day}
                  data-level={cell.level}
                  onMouseEnter={() => setHovered(cell)}
                  onMouseLeave={() => setHovered(null)}
                  className={cn(
                    "aspect-square w-full rounded-[3px]",
                    cell.future ? "bg-transparent" : LEVEL_CLASS[cell.level],
                    hovered?.day === cell.day && "ring-2 ring-foreground/60",
                  )}
                />
              )),
            ];
          })}
        </div>
      </div>
      <p className="mt-2 min-h-4 text-xs text-muted-foreground tabular-nums" aria-hidden>
        {hovered && !hovered.future ? describe(hovered) : "Наведите на день, чтобы увидеть объём"}
      </p>

      <div className="sr-only">
        <table>
          <caption>Дни с тренировками за {columns.length} недель</caption>
          <tbody>
            {cells
              .filter((c) => c.workouts > 0)
              .map((c) => (
                <tr key={c.day}>
                  <td>{describe(c)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

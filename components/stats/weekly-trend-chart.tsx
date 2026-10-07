"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WeekPoint } from "@/lib/stats/series";

const fmt = (n: number, digits = 1) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

/** Одна метрика за раз — у каждой своя шкала (никаких двух осей). */
const METRICS = {
  volume: { tab: "Объём", title: "Объём по неделям", format: (n: number) => `${fmt(n, 0)} кг`, tick: (n: number) => compact.format(n) },
  workouts: { tab: "Тренировки", title: "Тренировки по неделям", format: (n: number) => fmt(n, 0), tick: (n: number) => fmt(n, 0) },
  hours: { tab: "Часы", title: "Часы в зале по неделям", format: (n: number) => `${fmt(n)} ч`, tick: (n: number) => fmt(n) },
  sets: { tab: "Подходы", title: "Рабочие подходы по неделям", format: (n: number) => fmt(n, 0), tick: (n: number) => fmt(n, 0) },
  density: {
    tab: "Плотность",
    title: "Плотность тренировок",
   
    format: (n: number) => `${fmt(n)} кг/мин`,
    tick: (n: number) => fmt(n, 0),
  },
  prs: { tab: "Рекорды", title: "Побитые рекорды по неделям", format: (n: number) => fmt(n, 0), tick: (n: number) => fmt(n, 0) },
} as const;
type Metric = keyof typeof METRICS;

const HINTS: Partial<Record<Metric, string>> = {
  density: "Поднятый вес за минуту тренировки: растёт, когда вы работаете больше за то же время",
};

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const weekRange = (week: string) => {
  const end = toDate(week);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dayMonth.format(toDate(week))} – ${dayMonth.format(end)}`;
};

/** Сравниваем две последние полные недели: текущая ещё идёт, и её «−100%» в понедельник ничего не значит. */
function delta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "без изменений" : "рост с нуля";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "без изменений";
  return `${pct > 0 ? "▲ +" : "▼ "}${pct}% к позапрошлой`;
}

type Point = WeekPoint & { value: number; current: boolean };

function TrendTooltip({ active, payload, metric }: { active?: boolean; payload?: { payload: Point }[]; metric: Metric }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">
        {weekRange(p.week)}
        {p.current ? <span className="text-muted-foreground"> · идёт сейчас</span> : null}
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-chart-1" aria-hidden />
        <span className="font-semibold tabular-nums">{METRICS[metric].format(p.value)}</span>
      </p>
      <p className="mt-1 text-muted-foreground tabular-nums">
        тренировок: {p.workouts} · {fmt(p.hours)} ч
      </p>
    </div>
  );
}

export function WeeklyTrendChart({ weeks }: { weeks: WeekPoint[] }) {
  const [metric, setMetric] = useState<Metric>("volume");
  const m = METRICS[metric];
  const data: Point[] = weeks.map((w, i) => ({ ...w, value: w[metric], current: i === weeks.length - 1 }));
  const config = { value: { label: m.tab, color: "var(--chart-1)" } } satisfies ChartConfig;
  const [beforeLast, last, current] = data.slice(-3);
  const empty = data.every((p) => p.value === 0);

  return (
    <section aria-label="Тренды по неделям" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-bold">{m.title}</h2>
          <p className="text-sm text-muted-foreground" data-testid="trend-summary">
            Прошлая неделя: <span className="font-semibold text-foreground">{m.format(last.value)}</span> ·{" "}
            {delta(last.value, beforeLast.value)} · сейчас {m.format(current.value)}
          </p>
        </div>
      </div>
      <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)} className="-mx-4 mt-3 overflow-x-auto px-4">
        <TabsList>
          {(Object.keys(METRICS) as Metric[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {METRICS[key].tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {HINTS[metric] ? <p className="mt-2 text-xs text-muted-foreground">{HINTS[metric]}</p> : null}

      {empty ? (
        <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          За {weeks.length} недель данных нет
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-56 w-full">
          <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={8}
              tickFormatter={(w: string) => dayMonth.format(toDate(w))}
            />
            <YAxis width={64} tickLine={false} axisLine={false} tickCount={4} allowDecimals={metric !== "workouts" && metric !== "sets" && metric !== "prs"} tickFormatter={m.tick} />
            <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<TrendTooltip metric={metric} />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={24}>
              {/* Текущая неделя ещё идёт — приглушена */}
              {data.map((p) => (
                <Cell key={p.week} fillOpacity={p.current ? 0.5 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Последний столбец — текущая неделя, она ещё не закончилась</p>

      <div className="sr-only">
        <table>
          <caption>{m.title}</caption>
          <tbody>
            {data.map((p) => (
              <tr key={p.week}>
                <th scope="row">{weekRange(p.week)}</th>
                <td>{m.format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

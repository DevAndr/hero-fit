"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DayPoint } from "@/lib/dashboard/series";
import { formatTonnage, formatTonnageAxis } from "@/lib/format";

const config = { volume: { label: "Объём", color: "var(--chart-1)" } } satisfies ChartConfig;

const RANGES = { "7": 7, "30": 30 } as const;
type Range = keyof typeof RANGES;

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const kg = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} кг`;

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: { payload: DayPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium first-letter:uppercase">{fullDate.format(toDate(point.day))}</p>
      {point.workouts ? (
        <p className="mt-1 flex items-center gap-2">
          <span className="size-2 rounded-[2px] bg-chart-1" aria-hidden />
          <span className="font-semibold tabular-nums">{formatTonnage(point.volume)}</span>
          <span className="text-muted-foreground">
            · тренировок: {point.workouts}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">Без тренировок</p>
      )}
    </div>
  );
}

export function VolumeChart({ data }: { data: DayPoint[] }) {
  const [range, setRange] = useState<Range>("7");
  const points = data.slice(-RANGES[range]);
  const total = points.reduce((sum, p) => sum + p.volume, 0);
  const workouts = points.reduce((sum, p) => sum + p.workouts, 0);

  return (
    <section aria-label="Объём тренировок" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Объём тренировок</h2>
          <p className="text-sm text-muted-foreground">
            {formatTonnage(total)} · тренировок: {workouts}
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList>
            <TabsTrigger value="7">7 дней</TabsTrigger>
            <TabsTrigger value="30">30 дней</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {workouts === 0 ? (
        <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          За {RANGES[range]} дней тренировок не было
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-52 w-full">
          <BarChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={range === "7" ? 0 : 4}
              tickFormatter={(day: string) => (range === "7" ? weekday.format(toDate(day)) : dayMonth.format(toDate(day)))}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tickCount={4}
              tickFormatter={formatTonnageAxis}
            />
            <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<VolumeTooltip />} />
            <Bar dataKey="volume" fill="var(--color-volume)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartContainer>
      )}

      {/* Табличное представление для скринридеров */}
      <div className="sr-only">
        <table>
          <caption>Объём по дням за {RANGES[range]} дней</caption>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Объём</th>
              <th>Тренировок</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <td>{dayMonth.format(toDate(p.day))}</td>
                <td>{kg(p.volume)}</td>
                <td>{p.workouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

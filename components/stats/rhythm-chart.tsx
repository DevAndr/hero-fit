"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Point = { label: string; workouts: number };

const config = { workouts: { label: "Тренировок", color: "var(--chart-2)" } } satisfies ChartConfig;
const VIEWS = { weekdays: "Дни недели", hours: "Время суток" } as const;
type View = keyof typeof VIEWS;

function RhythmTooltip({ active, payload, view }: { active?: boolean; payload?: { payload: Point }[]; view: View }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{view === "hours" ? `Начало в ${p.label}` : p.label}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-chart-2" aria-hidden />
        тренировок: <span className="font-semibold tabular-nums">{p.workouts}</span>
      </p>
    </div>
  );
}

export function RhythmChart({ weekdays, hours }: { weekdays: Point[]; hours: Point[] }) {
  const [view, setView] = useState<View>("weekdays");
  const data = view === "weekdays" ? weekdays : hours;
  const top = data.reduce((best, p) => (p.workouts > best.workouts ? p : best), data[0]);
  const total = data.reduce((s, p) => s + p.workouts, 0);

  return (
    <section aria-label="Когда вы тренируетесь" className="flex flex-col rounded-xl border bg-card p-4">
      <h2 className="font-bold">Когда вы тренируетесь</h2>
      <p className="text-sm text-muted-foreground">
        {total === 0 ? (
          "Пока нет данных"
        ) : (
          <>
            Чаще всего: <span className="font-semibold text-foreground">{view === "hours" ? `с ${top.label}` : top.label}</span>
          </>
        )}
      </p>
      <Tabs value={view} onValueChange={(v) => setView(v as View)} className="mt-3">
        <TabsList>
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <TabsTrigger key={v} value={v}>
              {VIEWS[v]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ChartContainer config={config} className="mt-4 aspect-auto h-48 w-full">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={view === "hours" ? 5 : 0}
          />
          <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} tickCount={4} />
          <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<RhythmTooltip view={view} />} />
          <Bar dataKey="workouts" fill="var(--color-workouts)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>

      <div className="sr-only">
        <table>
          <caption>Тренировки: {VIEWS[view].toLowerCase()}</caption>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>{p.workouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

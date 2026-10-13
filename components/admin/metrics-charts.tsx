"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { DailySeries } from "@/lib/admin/metrics-queries";

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

/** Линии «Активные»: цвет закреплён за рядом (проверенная палитра --series-*). */
const ACTIVE = [
  { key: "visited", label: "Заходили", color: "var(--series-1)" },
  { key: "trained", label: "Тренировались", color: "var(--series-2)" },
] as const;

type Row = { day: string; value?: number; visited?: number; trained?: number };

function Tooltip({ active, payload, rows }: { active?: boolean; payload?: { payload: Row }[]; rows: { key: keyof Row; label: string; color: string }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium first-letter:uppercase">{fullDate.format(toDate(point.day))}</p>
      {rows.map((r) => (
        <p key={r.key} className="mt-1 flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />
          <span className="text-muted-foreground">{r.label}:</span>
          <span className="font-semibold tabular-nums">{point[r.key]}</span>
        </p>
      ))}
    </div>
  );
}

function Card({ title, summary, children, table }: { title: string; summary: string; children: React.ReactNode; table: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">{title}</h2>
      <p className="text-sm text-muted-foreground">{summary}</p>
      {children}
      {/* Табличное представление для скринридеров */}
      <div className="sr-only">{table}</div>
    </section>
  );
}

const axisX = (range: number) => ({
  dataKey: "day",
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  interval: range === 90 ? 13 : 4,
  tickFormatter: (day: string) => dayMonth.format(toDate(day)),
});

function BarCard({ title, label, points, range }: { title: string; label: string; points: { day: string; value: number }[]; range: number }) {
  const total = points.reduce((s, p) => s + p.value, 0);
  const config = { value: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <Card
      title={title}
      summary={`${total.toLocaleString("ru-RU")} за ${range} дней`}
      table={
        <table>
          <caption>
            {title} по дням за {range} дней
          </caption>
          <thead>
            <tr>
              <th>Дата</th>
              <th>{label}</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}>
                <td>{dayMonth.format(toDate(p.day))}</td>
                <td>{p.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ChartContainer config={config} className="mt-4 aspect-auto h-48 w-full">
        <BarChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis {...axisX(range)} />
          <YAxis width={40} tickLine={false} axisLine={false} tickCount={4} allowDecimals={false} />
          <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<Tooltip rows={[{ key: "value", label, color: "var(--chart-1)" }]} />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}

function ActiveCard({ series, range }: { series: DailySeries; range: number }) {
  const data: Row[] = series.visited.map((p, i) => ({ day: p.day, visited: p.value, trained: series.trained[i]?.value ?? 0 }));
  const config = Object.fromEntries(ACTIVE.map((a) => [a.key, { label: a.label, color: a.color }])) satisfies ChartConfig;
  return (
    <Card
      title="Активные"
      summary="Разные пользователи за день"
      table={
        <table>
          <caption>Активные по дням за {range} дней</caption>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Заходили</th>
              <th>Тренировались</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.day}>
                <td>{dayMonth.format(toDate(p.day))}</td>
                <td>{p.visited}</td>
                <td>{p.trained}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden>
        {ACTIVE.map((a) => (
          <li key={a.key} className="flex items-center gap-1.5">
            <svg width="18" height="8" viewBox="0 0 18 8">
              <line x1="1" y1="4" x2="17" y2="4" stroke={a.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {a.label}
          </li>
        ))}
      </ul>
      <ChartContainer config={config} className="mt-2 aspect-auto h-48 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeWidth={1} />
          <XAxis {...axisX(range)} />
          <YAxis width={40} tickLine={false} axisLine={false} tickCount={4} allowDecimals={false} />
          <ChartTooltip content={<Tooltip rows={[...ACTIVE]} />} />
          {ACTIVE.map((a) => (
            <Line key={a.key} dataKey={a.key} type="linear" stroke={a.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ChartContainer>
    </Card>
  );
}

export function MetricsCharts({ series, range }: { series: DailySeries; range: 30 | 90 }) {
  return (
    <div className="space-y-4">
      <nav aria-label="Период графиков" className="flex gap-2">
        {([30, 90] as const).map((r) => (
          <Link
            key={r}
            href={`/admin?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              r === range ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {r} дней
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ActiveCard series={series} range={range} />
        </div>
        <BarCard title="Регистрации" label="Новых" points={series.signups} range={range} />
        <BarCard title="Тренировки" label="Завершено" points={series.workouts} range={range} />
      </div>
    </div>
  );
}

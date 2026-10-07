"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { StrengthSeries } from "@/lib/stats/series";

/** Цвет закреплён за позицией серии (упражнения отсортированы по частоте) — проверенная палитра --series-*. */
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
/**
 * Второй канал помимо цвета: форма точки (круг / квадрат / ромб). В светлой теме пара
 * зелёный↔оранжевый при протанопии различима слабо (ΔE 7.7) — форма снимает зависимость от цвета.
 */
type Shape = "circle" | "square" | "diamond";
const SHAPES: Shape[] = ["circle", "square", "diamond"];

function Marker({ shape, cx, cy, r, fill }: { shape: Shape; cx: number; cy: number; r: number; fill: string }) {
  const ring = { fill, stroke: "var(--card)", strokeWidth: 2 };
  if (shape === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={1.5} {...ring} />;
  if (shape === "diamond") {
    const d = r * 1.3;
    return <path d={`M${cx} ${cy - d}L${cx + d} ${cy}L${cx} ${cy + d}L${cx - d} ${cy}Z`} {...ring} />;
  }
  return <circle cx={cx} cy={cy} r={r} {...ring} />;
}

function dot(shape: Shape, color: string, r: number) {
  function Dot(props: { cx?: number; cy?: number; index?: number; value?: unknown }) {
    if (props.cx == null || props.cy == null || props.value == null) return <g key={props.index} />;
    return <Marker key={props.index} shape={shape} cx={props.cx} cy={props.cy} r={r} fill={color} />;
  }
  return Dot;
}

/** Образец для легенды: отрезок линии с маркером. */
function LegendKey({ index }: { index: number }) {
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="shrink-0 overflow-visible">
      <line x1="1" y1="6" x2="21" y2="6" stroke={COLORS[index]} strokeWidth="2" strokeLinecap="round" />
      <Marker shape={SHAPES[index]} cx={11} cy={6} r={4} fill={COLORS[index]} />
    </svg>
  );
}

type Point = Record<string, number | string | null>;

const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

function StrengthTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  series: StrengthSeries[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const rows = series.filter((s) => p[s.key] !== null);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">Неделя с {dayMonth.format(toDate(String(p.week)))}</p>
      {rows.map((s) => (
        <p key={s.key} className="mt-1 flex items-center gap-2">
          <LegendKey index={Number(s.key.slice(1))} />
          <span className="text-muted-foreground">{s.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums">{fmt(p[s.key] as number)} кг</span>
        </p>
      ))}
    </div>
  );
}

export function StrengthChart({ series, points }: { series: StrengthSeries[]; points: Point[] }) {
  const sessions = series.map((s) => points.filter((p) => p[s.key] !== null).length);
  const config = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.name, color: COLORS[i] }]),
  ) satisfies ChartConfig;
  // Обрезаем пустые недели в начале — график начинается с первой тренировки с весом.
  const firstIdx = points.findIndex((p) => series.some((s) => p[s.key] !== null));
  const data = firstIdx > 0 ? points.slice(firstIdx) : points;

  return (
    <section aria-label="Сила в упражнениях" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">Сила: расчётный 1RM</h2>
      <p className="text-sm text-muted-foreground">Лучший 1RM за неделю (формула Эпли) в самых частых упражнениях, кг</p>

      {series.length === 0 || Math.max(...sessions) < 2 ? (
        <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
          График появится после двух недель тренировок с весом
        </div>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Легенда">
            {series.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <LegendKey index={i} />
                {s.name}
              </li>
            ))}
          </ul>
          <ChartContainer config={config} className="mt-3 aspect-auto h-64 w-full">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(w: string) => dayMonth.format(toDate(w))}
              />
              <YAxis width={44} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickCount={5} />
              <ChartTooltip content={<StrengthTooltip series={series} />} />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  connectNulls
                  stroke={`var(--color-${s.key})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={dot(SHAPES[i], COLORS[i], 4)}
                  activeDot={dot(SHAPES[i], COLORS[i], 6)}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        </>
      )}

      <div className="sr-only">
        <table>
          <caption>Расчётный 1RM по неделям</caption>
          <thead>
            <tr>
              <th>Неделя</th>
              {series.map((s) => (
                <th key={s.key}>{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={String(p.week)}>
                <th scope="row">{dayMonth.format(toDate(String(p.week)))}</th>
                {series.map((s) => (
                  <td key={s.key}>{p[s.key] === null ? "—" : `${fmt(p[s.key] as number)} кг`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

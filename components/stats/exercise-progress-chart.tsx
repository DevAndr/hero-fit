"use client";

import { useId } from "react";
import { Area, AreaChart, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ExerciseSession } from "@/lib/stats/queries";
import { cn } from "@/lib/utils";

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

type Point = ExerciseSession & { value: number };

function ProgressTooltip({
  active,
  payload,
  bodyweight,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  bodyweight: boolean;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="max-w-60 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{fullDate.format(new Date(p.date))}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-1" aria-hidden />
        <span className="font-semibold tabular-nums">{bodyweight ? `${p.value} повт.` : `${fmt(p.value)} кг`}</span>
        {!bodyweight && p.best1RM ? <span className="text-muted-foreground">· 1RM ≈ {fmt(p.best1RM)} кг</span> : null}
      </p>
      <p className="mt-1 text-muted-foreground tabular-nums">
        {p.sets.map((s) => (s.weight ? `${fmt(s.weight)}×${s.reps}` : `${s.reps}`)).join(", ")}
      </p>
    </div>
  );
}

/**
 * Карточка-показатель: последний рабочий вес (для упражнений со своим весом — макс. повторы),
 * изменение к первой тренировке и плавный график с заливкой без осей. Значения по точкам — в подсказке и таблице.
 */
export function ExerciseProgressChart({ sessions }: { sessions: ExerciseSession[] }) {
  // useId содержит символы, недопустимые в url(#…) — оставляем только безопасные.
  const gradientId = `progress-${useId().replace(/[^\w-]/g, "")}`;
  const bodyweight = sessions.every((s) => s.topWeight === 0);
  const data: Point[] = sessions.map((s) => ({
    ...s,
    value: bodyweight ? Math.max(...s.sets.map((x) => x.reps)) : s.topWeight,
  }));
  const config = {
    value: { label: bodyweight ? "Макс. повторы" : "Рабочий вес", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const unit = bodyweight ? "повт." : "кг";
  const first = data[0];
  const last = data.at(-1);
  const change = first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  // Шкала по диапазону значений с запасом — колебания видны, линия не прилипает к краям.
  const values = data.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, max * 0.1) : (max - min) * 0.25;

  return (
    <section aria-label="График прогресса" className="rounded-xl border bg-card p-4">
      <h2 className="text-sm text-muted-foreground">{bodyweight ? "Макс. повторы в подходе" : "Рабочий вес"}</h2>
      {last ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold" data-testid="progress-value">
            {fmt(last.value)} {unit}
          </span>
          {change !== null && data.length > 1 ? (
            <span
              data-testid="progress-change"
              title={`К первой тренировке (${fullDate.format(new Date(first.date))})`}
              className={cn(
                "text-sm font-medium tabular-nums",
                change > 0 ? "text-primary" : change < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {change > 0 ? "▲ " : change < 0 ? "▼ " : ""}
              {pct.format(change)}%
            </span>
          ) : null}
        </p>
      ) : null}

      {data.length < 2 ? (
        <div className="mt-4 flex h-32 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
          График появится после второй тренировки с этим упражнением
        </div>
      ) : (
        <>
          <ChartContainer config={config} className="mt-3 aspect-auto h-36 w-full">
            <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 6 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={[min - pad, max + pad]} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={<ProgressTooltip bodyweight={bodyweight} />}
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 5, fill: "var(--color-value)", stroke: "var(--card)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ChartContainer>
          <p className="mt-1 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{dayMonth.format(new Date(first.date))}</span>
            <span>тренировок: {data.length}</span>
            <span>{dayMonth.format(new Date(last!.date))}</span>
          </p>
        </>
      )}

      <div className="sr-only">
        <table>
          <caption>{config.value.label} по тренировкам</caption>
          <tbody>
            {data.map((p) => (
              <tr key={p.workoutId}>
                <th scope="row">{fullDate.format(new Date(p.date))}</th>
                <td>
                  {fmt(p.value)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

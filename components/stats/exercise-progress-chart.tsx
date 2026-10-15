"use client";

import { useId } from "react";
import { Area, AreaChart, ReferenceLine, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ExerciseSession } from "@/lib/stats/queries";
import { formatSet } from "@/lib/format";
import { formatClock, formatKm, isTimed, timedSetText, type ExerciseKindName } from "@/lib/workouts/kinds";
import { cn } from "@/lib/utils";

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

type Point = ExerciseSession & { value: number };

/** Что показывает график: рабочий вес, повторы (свой вес), лучшее время (на время) или дистанция (кардио). */
type Metric = { label: string; title: string; value: (s: ExerciseSession) => number; show: (v: number) => string; sets: (s: ExerciseSession) => string };

function metricOf(kind: ExerciseKindName, sessions: ExerciseSession[]): Metric {
  if (isTimed(kind)) {
    const cardio = kind === "CARDIO";
    return {
      label: cardio ? "Дистанция" : "Лучшее время",
      title: cardio ? "Самый длинный подход" : "Лучшее время подхода",
      value: (s) => Math.max(...s.sets.map((x) => (cardio ? (x.distanceM ?? 0) : (x.durationSec ?? 0)))),
      show: cardio ? formatKm : formatClock,
      sets: (s) => s.sets.map((x) => timedSetText(kind, x)).join(", "),
    };
  }
  const bodyweight = sessions.every((s) => s.topWeight === 0);
  return {
    label: bodyweight ? "Макс. повторы" : "Рабочий вес",
    title: bodyweight ? "Макс. повторы в подходе" : "Рабочий вес",
    value: (s) => (bodyweight ? Math.max(...s.sets.map((x) => x.reps)) : s.topWeight),
    show: (v) => (bodyweight ? `${fmt(v)} повт.` : `${fmt(v)} кг`),
    sets: (s) => s.sets.map(formatSet).join(", "),
  };
}

function ProgressTooltip({
  active,
  payload,
  metric,
  strength,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
  metric: Metric;
  strength: boolean;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="max-w-60 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{fullDate.format(new Date(p.date))}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-full bg-chart-1" aria-hidden />
        <span className="font-semibold tabular-nums">{metric.show(p.value)}</span>
        {strength && p.best1RM ? <span className="text-muted-foreground">· 1RM ≈ {fmt(p.best1RM)} кг</span> : null}
      </p>
      <p className="mt-1 text-muted-foreground tabular-nums">{metric.sets(p)}</p>
    </div>
  );
}

/**
 * Карточка-показатель: последний рабочий вес (для упражнений со своим весом — макс. повторы),
 * изменение к первой тренировке и плавный график с заливкой без осей. Значения по точкам — в подсказке и таблице.
 */
/** goal — активная цель по показателю этого графика (рабочий вес или повторы) — пунктирная линия. */
export function ExerciseProgressChart({
  sessions,
  goal = null,
  forecast = null,
  kind = "REPS",
}: {
  sessions: ExerciseSession[];
  /** Вид упражнения: для времени и кардио — свой показатель. */
  kind?: ExerciseKindName;
  goal?: number | null;
  /** Прогноз цели по динамике (текст) — ось графика по тренировкам, поэтому строкой, а не линией. */
  forecast?: string | null;
}) {
  // useId содержит символы, недопустимые в url(#…) — оставляем только безопасные.
  const gradientId = `progress-${useId().replace(/[^\w-]/g, "")}`;
  const metric = metricOf(kind, sessions);
  const strength = !isTimed(kind) && !sessions.every((s) => s.topWeight === 0);
  const data: Point[] = sessions.map((s) => ({ ...s, value: metric.value(s) }));
  const config = {
    value: { label: metric.label, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  const first = data[0];
  const last = data.at(-1);
  const change = first && last && first.value > 0 ? ((last.value - first.value) / first.value) * 100 : null;

  // Шкала по диапазону значений с запасом — колебания видны, линия не прилипает к краям.
  const values = data.map((p) => p.value).concat(goal ?? []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? Math.max(1, max * 0.1) : (max - min) * 0.25;

  return (
    <section aria-label="График прогресса" className="rounded-xl border bg-card p-4">
      <h2 className="text-sm text-muted-foreground">{metric.title}</h2>
      {last ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold" data-testid="progress-value">
            {metric.show(last.value)}
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
      {goal !== null ? (
        <p className="text-xs text-muted-foreground">
          Цель — {metric.show(goal)}
          {forecast ? ` · ${forecast}` : ""}
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
                content={<ProgressTooltip metric={metric} strength={strength} />}
              />
              {goal !== null ? <ReferenceLine y={goal} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
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
                  {metric.show(p.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

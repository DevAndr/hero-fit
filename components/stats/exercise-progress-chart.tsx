"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { ExerciseSession } from "@/lib/stats/queries";

const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

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

/** Рабочий вес по тренировкам (для упражнений со своим весом — макс. повторы). Одна серия — без легенды. */
export function ExerciseProgressChart({ sessions }: { sessions: ExerciseSession[] }) {
  const bodyweight = sessions.every((s) => s.topWeight === 0);
  const data: Point[] = sessions.map((s) => ({
    ...s,
    value: bodyweight ? Math.max(...s.sets.map((x) => x.reps)) : s.topWeight,
  }));
  const config = {
    value: { label: bodyweight ? "Макс. повторы" : "Рабочий вес", color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <section aria-label="График прогресса" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">{bodyweight ? "Повторы по тренировкам" : "Рабочий вес по тренировкам"}</h2>
      <p className="text-sm text-muted-foreground">
        {bodyweight ? "Максимум повторов в подходе" : "Максимальный вес в рабочих подходах, кг"}
      </p>
      {data.length < 2 ? (
        <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed text-center text-sm text-muted-foreground">
          График появится после второй тренировки с этим упражнением
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-60 w-full">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(d: string) => dayMonth.format(new Date(d))}
            />
            <YAxis width={48} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickCount={5} />
            <ChartTooltip content={<ProgressTooltip bodyweight={bodyweight} />} />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: "var(--color-value)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: "var(--card)", strokeWidth: 2 }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </section>
  );
}

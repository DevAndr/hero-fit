"use client";

import { useState } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { MuscleRow } from "@/lib/stats/queries";

const config = { count: { label: "Упражнений", color: "var(--chart-1)" } } satisfies ChartConfig;

const PERIODS = { week: "7 дней", month: "30 дней", all: "Всё время" } as const;
type Period = keyof typeof PERIODS;

type Point = { label: string; count: number };

function MuscleTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{p.label}</p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-chart-1" aria-hidden />
        упражнений: <span className="font-semibold tabular-nums">{p.count}</span>
      </p>
    </div>
  );
}

export function MuscleChart({ rows }: { rows: MuscleRow[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const points: Point[] = rows
    .map((r) => ({ label: MUSCLE_GROUP_LABELS[r.group], count: r[period] }))
    .sort((a, b) => b.count - a.count);
  const total = points.reduce((s, p) => s + p.count, 0);

  return (
    <section aria-label="Группы мышц" className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Группы мышц</h2>
          <p className="text-sm text-muted-foreground">Упражнений по основной группе · всего {total}</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <TabsTrigger key={p} value={p}>
                {PERIODS[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          За этот период тренировок не было
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-80 w-full">
          <BarChart data={points} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barCategoryGap={4}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} interval={0} />
            <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<MuscleTooltip />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={20}>
              <LabelList dataKey="count" position="right" className="fill-foreground" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <table className="sr-only">
        <caption>Упражнений по группам мышц за период «{PERIODS[period]}»</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              <td>{p.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

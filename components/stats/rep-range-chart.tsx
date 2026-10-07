"use client";

import { useState } from "react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REP_RANGES, type RepRangeRow } from "@/lib/stats/ranges";

const config = { sets: { label: "Подходов", color: "var(--chart-2)" } } satisfies ChartConfig;
const PERIODS = { month: "30 дней", all: "Всё время" } as const;
type Period = keyof typeof PERIODS;

type Point = { label: string; hint: string; sets: number; share: number };

function RangeTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">
        {p.label} повторов · {p.hint}
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-chart-2" aria-hidden />
        подходов: <span className="font-semibold tabular-nums">{p.sets}</span>
        <span className="text-muted-foreground">({p.share}%)</span>
      </p>
    </div>
  );
}

/** Какая работа преобладает: силовая (1–5), на массу (6–12) или на выносливость (13+). */
export function RepRangeChart({ rows }: { rows: RepRangeRow[] }) {
  const [period, setPeriod] = useState<Period>("month");
  const total = rows.reduce((s, r) => s + r[period], 0);
  const data: Point[] = REP_RANGES.map((range) => {
    const sets = rows.find((r) => r.key === range.key)?.[period] ?? 0;
    return { label: range.label, hint: range.hint, sets, share: total ? Math.round((sets / total) * 100) : 0 };
  });
  const lead = total ? data.reduce((best, p) => (p.sets > best.sets ? p : best), data[0]) : null;

  return (
    <section aria-label="Диапазоны повторов" className="flex flex-col rounded-xl border bg-card p-4">
      <h2 className="font-bold">Диапазоны повторов</h2>
      <p className="text-sm text-muted-foreground">
        {lead ? (
          <>
            Преобладает: <span className="font-semibold text-foreground">{lead.hint}</span> ({lead.share}%)
          </>
        ) : (
          "Рабочие подходы с весом"
        )}
      </p>
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mt-3">
        <TabsList>
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <TabsTrigger key={p} value={p}>
              {PERIODS[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {total === 0 ? (
        <div className="mt-4 flex h-36 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Нет подходов с весом за этот период
        </div>
      ) : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-36 w-full">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="label"
              width={132}
              tickLine={false}
              axisLine={false}
              interval={0}
              tickFormatter={(label: string) => `${label} · ${data.find((d) => d.label === label)?.hint ?? ""}`}
            />
            <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<RangeTooltip />} />
            <Bar dataKey="sets" fill="var(--color-sets)" radius={[0, 4, 4, 0]} maxBarSize={20}>
              <LabelList dataKey="share" position="right" className="fill-foreground" fontSize={12} formatter={(v) => `${v}%`} />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <div className="sr-only">
        <table>
          <caption>Рабочие подходы по диапазонам повторов за период «{PERIODS[period]}»</caption>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <th scope="row">
                  {p.label} ({p.hint})
                </th>
                <td>
                  {p.sets} ({p.share}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

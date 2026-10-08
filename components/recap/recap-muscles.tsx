"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { RecapData } from "@/lib/recap/types";

const config = { sets: { label: "Подходов", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Подходы за неделю по основной группе мышц + подсказка про забытую группу. */
export function RecapMuscles({ muscles }: { muscles: NonNullable<RecapData["muscles"]> }) {
  const points = muscles.groups.map((g) => ({ label: MUSCLE_GROUP_LABELS[g.group], sets: g.sets }));
  return (
    <section aria-label="Группы мышц" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">Группы мышц</h2>
      <p className="text-sm text-muted-foreground">Рабочих подходов по основной группе</p>
      <ChartContainer config={config} className="mt-3 aspect-auto w-full" style={{ height: points.length * 28 + 8 }}>
        <BarChart data={points} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }} barCategoryGap={4}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={92} tickLine={false} axisLine={false} interval={0} />
          <Bar dataKey="sets" fill="var(--color-sets)" radius={[0, 4, 4, 0]} maxBarSize={20}>
            <LabelList dataKey="sets" position="right" className="fill-foreground" fontSize={12} />
          </Bar>
        </BarChart>
      </ChartContainer>
      {muscles.forgotten ? (
        <p className="mt-3 text-sm">
          <span className="font-semibold">{MUSCLE_GROUP_LABELS[muscles.forgotten]}</span> — 0 подходов уже 2 недели. Самое время вернуть их в план.
        </p>
      ) : null}
      <div className="sr-only">
        <table>
          <caption>Рабочих подходов по группам мышц за неделю</caption>
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <th scope="row">{p.label}</th>
                <td>{p.sets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

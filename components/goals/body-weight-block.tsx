"use client";

import { useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { WeightHistory } from "@/components/goals/weight-history";
import { logBodyWeightAction } from "@/lib/goals/actions";

const config = { weight: { label: "Вес", color: "var(--series-1)" } } satisfies ChartConfig;
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const kg = (n: number) => `${String(n).replace(".", ",")} кг`;

/** «Вес тела» на странице целей: запись за сегодня, график взвешиваний за 90 дней (пунктир — цель по весу) и их правка. */
export function BodyWeightBlock({ weights, target }: { weights: { date: string; weight: number }[]; target: number | null }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const weight = Number(value.trim().replace(",", "."));
      if (!value.trim() || !Number.isFinite(weight)) {
        toast.error("Укажите вес от 30 до 300 кг");
        return;
      }
      let res;
      try {
        res = await logBodyWeightAction(weight);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) toast.error(res.error);
      else {
        setValue("");
        toast.success(res.achieved ? `🎯 Цель достигнута: ${res.achieved}` : "Вес записан");
      }
    });

  const values = weights.map((w) => w.weight).concat(target ?? []);
  const domain = values.length ? [Math.floor(Math.min(...values) - 1), Math.ceil(Math.max(...values) + 1)] : [0, 1];

  return (
    <section aria-label="Вес тела" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Scale className="size-4 text-primary" />
        Вес тела
      </h2>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input aria-label="Вес сегодня, кг" inputMode="decimal" placeholder="кг" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-32" />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Записать вес
        </Button>
        {weights.length ? <span className="text-sm text-muted-foreground">Последний: {kg(weights.at(-1)!.weight)}</span> : null}
      </form>

      {weights.length >= 2 ? (
        <ChartContainer config={config} className="aspect-auto h-44 w-full">
          <LineChart data={weights} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => dayMonth.format(toDate(d))} />
            <YAxis width={40} tickLine={false} axisLine={false} domain={domain} tickCount={4} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => dayMonth.format(toDate(p[0]?.payload.date))} />} />
            {target !== null ? <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "цель", position: "insideTopRight", fontSize: 11 }} /> : null}
            <Line dataKey="weight" type="monotone" stroke="var(--color-weight)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      ) : (
        <p className="text-sm text-muted-foreground">Записывай вес — здесь появится график за 90 дней.</p>
      )}

      <WeightHistory weights={weights} />

      {/* Табличное представление для скринридеров */}
      <div className="sr-only">
        <table>
          <caption>Взвешивания за 90 дней</caption>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Вес</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((w) => (
              <tr key={w.date}>
                <td>{dayMonth.format(toDate(w.date))}</td>
                <td>{kg(w.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { logStretchMeasurementAction } from "@/lib/goals/stretch-actions";
import type { SkillView } from "@/lib/goals/queries";

const config = { cm: { label: "До цели, см", color: "var(--series-1)" } } satisfies ChartConfig;
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const cmText = (n: number) => `${String(n).replace(".", ",")} см`;

/** «Записать замер» на карточке цели-навыка и график замеров за 90 дней (ниже — лучше; старт — точка постановки). */
export function StretchMeasure({ goalId, title, skill }: { goalId: string; title: string; skill: SkillView }) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const cm = Number(value.trim().replace(",", "."));
      if (!value.trim() || !Number.isFinite(cm)) {
        toast.error("Укажите замер от 0 до 200 см");
        return;
      }
      let res;
      try {
        res = await logStretchMeasurementAction(goalId, cm);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
        return;
      }
      if (!res.ok) toast.error(res.error);
      else {
        setValue("");
        toast.success(res.achieved ? `🎯 Цель достигнута: ${title}` : "Замер записан");
      }
    });

  // Старт — на день постановки (замер того же дня его заменяет)
  const series = skill.measurements.some((m) => m.date === skill.start.date) ? skill.measurements : [skill.start, ...skill.measurements];
  const values = series.map((m) => m.cm);
  const domain = [0, Math.ceil(Math.max(...values, 1) + 1)];

  return (
    <div className="space-y-3 border-t pt-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input aria-label="Замер, см" inputMode="decimal" placeholder="см" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-28" {...selectOnFocus} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Записать замер
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Мерка: {skill.measure}. Замеряйте раз в неделю в одно и то же время после разминки
      </p>

      {series.length >= 2 ? (
        <ChartContainer config={config} className="aspect-auto h-36 w-full">
          <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(d: string) => dayMonth.format(toDate(d))} />
            <YAxis width={32} tickLine={false} axisLine={false} domain={domain} tickCount={4} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => dayMonth.format(toDate(p[0]?.payload.date))} />} />
            <Line dataKey="cm" type="monotone" stroke="var(--color-cm)" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ChartContainer>
      ) : null}

      {/* Табличное представление для скринридеров */}
      <div className="sr-only">
        <table aria-label={`Замеры за 90 дней: ${title}`}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>До цели</th>
            </tr>
          </thead>
          <tbody>
            {skill.measurements.map((m) => (
              <tr key={m.date} data-testid="stretch-measurement">
                <td>{dayMonth.format(toDate(m.date))}</td>
                <td>{cmText(m.cm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

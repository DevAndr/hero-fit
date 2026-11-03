"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { WEEK_DAYS, type WeekDay } from "@/lib/nutrition/diary";

const config = { kcal: { label: "Съедено", color: "var(--primary)" } } satisfies ChartConfig;

const n = (v: number) => v.toLocaleString("ru-RU");
// Ось — «2,5к»; верх — кратный 500 с запасом, чтобы деления были ровными
const axis = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}к` : String(v));
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function WeekTooltip({ active, payload, norm }: { active?: boolean; payload?: { payload: WeekDay }[]; norm: number | null }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium first-letter:uppercase">{fullDate.format(toDate(point.date))}</p>
      <p className="mt-1 tabular-nums">
        {point.kcal ? (
          <span className="font-semibold">
            {n(point.kcal)}
            {norm ? ` / ${n(norm)}` : ""} ккал
          </span>
        ) : (
          <span className="text-muted-foreground">Нет записей</span>
        )}
      </p>
    </div>
  );
}

/**
 * «Неделя» на /nutrition: съедено за 7 дней по сегодня, пунктир — текущая норма (старых норм не храним), сверх нормы — красным.
 * Столбик открывает этот день в дневнике; выбранный день — ярче.
 */
export function WeekChart({ days, avg, inNorm, norm, today, date }: { days: WeekDay[]; avg: number | null; inNorm: number; norm: number | null; today: string; date: string }) {
  const router = useRouter();
  const open = (day: string) => router.push(day === today ? "/nutrition" : `/nutrition?date=${day}`);
  const max = Math.max(norm ?? 0, ...days.map((d) => d.kcal));
  return (
    <section aria-label="Неделя" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">Неделя</h2>
      <p className="text-sm text-muted-foreground" data-testid="week-summary">
        {avg === null ? "За 7 дней записей нет" : `В среднем ${n(avg)} ккал${norm ? ` · в норме ${inNorm} из ${WEEK_DAYS} дней` : ""}`}
      </p>
      {avg === null ? null : (
        <ChartContainer config={config} className="mt-4 aspect-auto h-44 w-full">
          <BarChart data={days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeWidth={1} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} interval={0} tickFormatter={(d: string) => weekday.format(toDate(d))} />
            <YAxis width={44} tickLine={false} axisLine={false} tickCount={4} domain={[0, Math.ceil((max * 1.1) / 500) * 500]} tickFormatter={axis} />
            <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<WeekTooltip norm={norm} />} />
            {norm ? <ReferenceLine y={norm} stroke="var(--muted-foreground)" strokeDasharray="4 4" /> : null}
            <Bar dataKey="kcal" radius={[4, 4, 0, 0]} maxBarSize={32} cursor="pointer" onClick={(p: { payload?: WeekDay }) => p.payload && open(p.payload.date)}>
              {days.map((d) => (
                <Cell
                  key={d.date}
                  data-testid={`week-bar-${d.date}`}
                  fill={norm && d.kcal > norm ? "var(--destructive)" : "var(--color-kcal)"}
                  fillOpacity={d.date === date ? 1 : 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      {/* Табличное представление для скринридеров */}
      <div className="sr-only">
        <table>
          <caption>Съедено по дням за неделю</caption>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Ккал</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{dayMonth.format(toDate(d.date))}</td>
                <td>{d.kcal ? n(d.kcal) : "нет записей"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

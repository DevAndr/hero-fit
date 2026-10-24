"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { COIN_GROUP_LABELS, COIN_GROUPS, type CoinGroup, type CoinWeek } from "@/lib/shop/coin-stats";

const COLOR: Record<CoinGroup, string> = {
  workout: "var(--chart-1)",
  record: "var(--chart-2)",
  achievement: "var(--chart-3)",
  chest: "var(--chart-4)",
  progress: "var(--chart-5)",
};

const config = Object.fromEntries(COIN_GROUPS.map((g) => [g, { label: COIN_GROUP_LABELS[g], color: COLOR[g] }])) satisfies ChartConfig;

const fmt = (n: number) => n.toLocaleString("ru-RU");
const toDate = (day: string) => new Date(`${day}T12:00:00Z`);
const dayMonth = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const weekRange = (week: string) => {
  const end = toDate(week);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dayMonth.format(toDate(week))} – ${dayMonth.format(end)}`;
};

function CoinsTooltip({ active, payload }: { active?: boolean; payload?: { payload: CoinWeek }[] }) {
  const w = payload?.[0]?.payload;
  if (!active || !w) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{weekRange(w.week)}</p>
      <p className="mt-1 font-semibold tabular-nums">+{fmt(w.total)} монет</p>
      <ul className="mt-1 space-y-0.5">
        {COIN_GROUPS.filter((g) => w[g] > 0).map((g) => (
          <li key={g} className="flex items-center gap-2">
            <span className="size-2 rounded-[2px]" style={{ background: COLOR[g] }} aria-hidden />
            <span className="text-muted-foreground">{COIN_GROUP_LABELS[g]}</span>
            <span className="ml-auto tabular-nums">{fmt(w[g])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Полученные монеты по неделям, слоями по источникам; стартовый баланс и покупки не показываются. */
export function CoinsChart({ weeks, balance }: { weeks: CoinWeek[]; balance: number }) {
  const total = weeks.reduce((s, w) => s + w.total, 0);
  const used = COIN_GROUPS.filter((g) => weeks.some((w) => w[g] > 0));

  return (
    <section aria-label="Монеты" className="rounded-xl border bg-card p-4">
      <h2 className="font-bold">Монеты</h2>
      <p className="text-sm text-muted-foreground" data-testid="coins-summary">
        <span className="font-semibold text-foreground">+{fmt(total)}</span> за {weeks.length} недель · баланс {fmt(balance)}
      </p>

      {total === 0 ? (
        <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Монеты появятся после первой тренировки
        </div>
      ) : (
        <>
          <ChartContainer config={config} className="mt-4 aspect-auto h-56 w-full">
            <BarChart data={weeks} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                tickFormatter={(w: string) => dayMonth.format(toDate(w))}
              />
              <YAxis width={48} tickLine={false} axisLine={false} tickCount={4} allowDecimals={false} />
              <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<CoinsTooltip />} />
              {used.map((g, i) => (
                <Bar
                  key={g}
                  dataKey={g}
                  stackId="coins"
                  fill={`var(--color-${g})`}
                  maxBarSize={24}
                  radius={i === used.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Источники">
            {used.map((g) => (
              <li key={g} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: COLOR[g] }} aria-hidden />
                {COIN_GROUP_LABELS[g]}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Без стартового баланса и покупок; последний столбец — текущая неделя</p>

      <div className="sr-only">
        <table>
          <caption>Полученные монеты по неделям</caption>
          <tbody>
            {weeks
              .filter((w) => w.total > 0)
              .map((w) => (
                <tr key={w.week}>
                  <th scope="row">{weekRange(w.week)}</th>
                  <td>
                    {fmt(w.total)}: {COIN_GROUPS.filter((g) => w[g] > 0).map((g) => `${COIN_GROUP_LABELS[g]} ${fmt(w[g])}`).join(", ")}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

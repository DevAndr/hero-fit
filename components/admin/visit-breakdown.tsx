"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { axisX, Card, dayMonth, fullDate, toDate } from "@/components/admin/metrics-charts";
import { REFERRER } from "@/components/admin/signup-sources";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { OTHER_KEY, type Breakdown } from "@/lib/admin/metrics";
import type { VisitBreakdown as Data } from "@/lib/admin/metrics-queries";
import { cn } from "@/lib/utils";

const PALETTE = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const OTHER_COLOR = "var(--muted-foreground)";
/** У типов источника цвет закреплён за значением — не перекрашивается при смене периода. */
const REFERRER_ORDER = ["search", "social", "direct", "site"];

const MODES: { mode: Breakdown; label: string }[] = [
  { mode: "referrer", label: "Источники" },
  { mode: "source", label: "utm_source" },
  { mode: "campaign", label: "utm_campaign" },
];

const SUMMARY: Record<Breakdown, string> = {
  referrer: "новых посетителей",
  source: "переходов по меткам",
  campaign: "переходов по меткам",
};

const chip = (current: boolean) =>
  cn("rounded-lg border px-3 py-1.5 text-sm font-medium", current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");

function seriesLabel(mode: Breakdown, key: string | null) {
  if (key === OTHER_KEY) return "прочие";
  if (mode === "referrer") return key === null ? "—" : (REFERRER[key] ?? key);
  return key ?? "без кампании";
}

/** Цвета рядов: у типов источника — закреплённые, незнакомые значения — следующими цветами палитры, без повторов. */
function seriesColors(mode: Breakdown, keys: (string | null)[]) {
  let next = mode === "referrer" ? REFERRER_ORDER.length : 0;
  return keys.map((key) => {
    if (key === OTHER_KEY) return OTHER_COLOR;
    const fixed = mode === "referrer" && key !== null ? REFERRER_ORDER.indexOf(key) : -1;
    return PALETTE[fixed >= 0 ? fixed : next++] ?? OTHER_COLOR;
  });
}

type Point = { day: string } & Record<string, number | string>;
type SeriesRow = { id: string; label: string; color: string; total: number };

function Tooltip({ active, payload, rows }: { active?: boolean; payload?: { payload: Point }[]; rows: SeriesRow[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium first-letter:uppercase">{fullDate.format(toDate(point.day))}</p>
      {rows.map((r) => (
        <p key={r.id} className="mt-1 flex items-center gap-2">
          <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />
          <span className="text-muted-foreground">{r.label}:</span>
          <span className="font-semibold tabular-nums">{point[r.id]}</span>
        </p>
      ))}
    </div>
  );
}

/** «Откуда приходят»: новые посетители по типу источника или переходы с меткой по utm_source / utm_campaign. */
export function VisitBreakdown({ data, range }: { data: Data; range: 30 | 90 }) {
  const { mode, stacked } = data;
  const href = (m: Breakdown, utm?: string) => `/admin?range=${range}&visits=${m}${utm ? `&utm=${encodeURIComponent(utm)}` : ""}`;
  // dataKey — индекс: в значениях utm бывают точки, recharts читал бы их как путь
  const colors = seriesColors(mode, stacked.series.map((s) => s.key));
  const rows: SeriesRow[] = stacked.series.map((s, i) => ({ id: `s${i}`, label: seriesLabel(mode, s.key), color: colors[i], total: s.total }));
  const points: Point[] = stacked.points.map((p) => ({ day: p.day, ...Object.fromEntries(p.values.map((v, i) => [`s${i}`, v])) }));
  const total = rows.reduce((s, r) => s + r.total, 0);
  const config = Object.fromEntries(rows.map((r) => [r.id, { label: r.label, color: r.color }])) satisfies ChartConfig;
  const title = "Откуда приходят";
  const caption = mode === "campaign" ? `Кампании ${data.source ?? ""} по дням за ${range} дней` : `${title} по дням за ${range} дней`;

  return (
    <Card
      title={title}
      summary={`${total.toLocaleString("ru-RU")} ${SUMMARY[mode]} за ${range} дней`}
      table={
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th>Дата</th>
              {rows.map((r) => (
                <th key={r.id}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stacked.points.map((p) => (
              <tr key={p.day}>
                <td>{dayMonth.format(toDate(p.day))}</td>
                {p.values.map((v, i) => (
                  <td key={i}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <nav aria-label="Разбивка" className="mt-3 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <Link key={m.mode} href={href(m.mode, data.source ?? undefined)} aria-current={m.mode === mode ? "page" : undefined} className={chip(m.mode === mode)}>
            {m.label}
          </Link>
        ))}
      </nav>
      {mode === "campaign" && data.sources.length > 0 ? (
        <nav aria-label="utm_source" className="mt-2 flex flex-wrap gap-2">
          {data.sources.map((s) => (
            <Link key={s} href={href("campaign", s)} aria-current={s === data.source ? "page" : undefined} className={cn(chip(s === data.source), "break-all")}>
              {s}
            </Link>
          ))}
        </nav>
      ) : null}
      {rows.length === 0 ? (
        <p className="mt-6 mb-4 text-center text-sm text-muted-foreground">
          {mode === "referrer" ? "Новых посетителей за период нет" : "Переходов по ссылкам с метками за период нет"}
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: r.color }} />
                <span className="break-all">{r.label}</span>
                <span className="font-semibold text-foreground tabular-nums">{r.total.toLocaleString("ru-RU")}</span>
              </li>
            ))}
          </ul>
          <ChartContainer config={config} className="mt-2 aspect-auto h-56 w-full">
            <BarChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis {...axisX(range)} />
              <YAxis width={40} tickLine={false} axisLine={false} tickCount={4} allowDecimals={false} />
              <ChartTooltip content={<Tooltip rows={rows} />} />
              {rows.map((r) => (
                // Обводка цветом карточки — зазор между сегментами столбика
                <Bar key={r.id} dataKey={r.id} stackId="v" fill={r.color} stroke="var(--card)" strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
              ))}
            </BarChart>
          </ChartContainer>
        </>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {mode === "referrer"
          ? "Новые посетители — первый заход гостя, по типу источника перехода."
          : "Переходы — каждый заход гостя по ссылке с меткой (один человек может дать несколько); топ-5, остальное — «прочие»."}
      </p>
    </Card>
  );
}

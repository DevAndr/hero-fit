import type { Slice } from "@/lib/dashboard/v3";
import { BALANCE_DAYS } from "@/lib/progress/balance";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { plural } from "@/lib/format";
import { Widget } from "./widgets";

/** Цвет закреплён за местом ряда; «прочие» — приглушённым (палитра --series-1…5 проверена валидатором в обеих темах). */
const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const OTHER = "var(--muted-foreground)";
const R = 15.915; // длина окружности ≈ 100 — доли в процентах сразу задают длину дуги
const GAP = 1.2; // зазор между сегментами, в процентах окружности

const label = (key: Slice["key"]) => (key === "other" ? "Прочие" : MUSCLE_GROUP_LABELS[key]);

/** Баланс нагрузки: доли подходов по группам мышц за 30 дней кольцом, итог — в центре. */
export function BalanceDonut({ slices }: { slices: Slice[] }) {
  const total = Math.round(slices.reduce((s, x) => s + x.sets, 0));
  const colored = slices.map((s, i) => ({ ...s, color: s.key === "other" ? OTHER : (COLORS[i] ?? OTHER) }));
  // Начало — сверху (25), каждый сегмент сдвинут на сумму долей перед ним
  const arcs = colored.map((s, i) => ({
    ...s,
    len: Math.max(s.pct - (colored.length > 1 ? GAP : 0), 0.5),
    offset: 25 - colored.slice(0, i).reduce((sum, x) => sum + x.pct, 0),
  }));

  return (
    <Widget title="Баланс нагрузки">
      <p className="text-xs text-muted-foreground">Подходы по группам мышц за {BALANCE_DAYS} дней</p>
      {slices.length ? (
        <div className="mt-3 flex flex-1 items-center gap-4">
          <svg viewBox="0 0 42 42" className="size-32 shrink-0" aria-hidden>
            <circle cx="21" cy="21" r={R} fill="none" stroke="var(--muted)" strokeWidth="6" />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth="6"
                strokeDasharray={`${a.len} ${100 - a.len}`}
                strokeDashoffset={a.offset}
              >
                <title>{`${label(a.key)}: ${a.pct} %`}</title>
              </circle>
            ))}
            <text x="21" y="21" textAnchor="middle" className="fill-foreground text-[7px] font-black">
              {total}
            </text>
            <text x="21" y="27" textAnchor="middle" className="fill-muted-foreground text-[3.2px]">
              {plural(total, "подход", "подхода", "подходов")}
            </text>
          </svg>
          <ul className="min-w-0 space-y-1 text-sm">
            {colored.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                <span className="truncate">{label(s.key)}</span>
                <span className="ml-auto font-semibold tabular-nums">{s.pct} %</span>
              </li>
            ))}
          </ul>
          <table className="sr-only">
            <caption>Доли подходов по группам мышц за {BALANCE_DAYS} дней</caption>
            <tbody>
              {colored.map((s) => (
                <tr key={s.key}>
                  <th scope="row">{label(s.key)}</th>
                  <td>{s.pct} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Баланс появится после тренировок</p>
      )}
    </Widget>
  );
}

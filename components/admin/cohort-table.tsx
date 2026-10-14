import type { CohortRow } from "@/lib/admin/metrics";

const weekLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

/** Удержание: % когорты, активных в неделю N после регистрации; фон — насыщенность primary по проценту (до 50 %). */
export function CohortTable({ rows }: { rows: CohortRow[] }) {
  const weeks = rows[0]?.cells.length ?? 0;
  return (
    <section aria-label="Удержание" className="rounded-xl border bg-card p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-sm">
          <caption className="mb-2 text-left font-bold">Удержание по неделям регистрации</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="px-2 py-1 text-left font-medium">
                Неделя
              </th>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                Новых
              </th>
              {Array.from({ length: weeks }, (_, i) => (
                <th key={i} scope="col" className="px-2 py-1 text-center font-medium">
                  {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week}>
                <th scope="row" className="px-2 py-1 text-left font-medium whitespace-nowrap">
                  {weekLabel.format(new Date(`${r.week}T12:00:00Z`))}
                </th>
                <td className="px-2 py-1 text-right tabular-nums">{r.size}</td>
                {r.cells.map((c, i) =>
                  c === null ? (
                    <td key={i} />
                  ) : (
                    <td
                      key={i}
                      className="rounded-md px-2 py-1 text-center tabular-nums"
                      // Насыщенность фона — не больше половины primary: обычный текст читается в обеих темах (от 5:1)
                      style={{ background: `color-mix(in oklch, var(--primary) ${Math.round(c / 2)}%, var(--muted))` }}
                    >
                      {c} %
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Активный — заходил в кабинет или завершил тренировку в эту неделю. Неделя 0 — неделя регистрации.
      </p>
    </section>
  );
}

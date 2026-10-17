import { WEEKDAYS_SHORT } from "@/lib/plans/view";
import type { CatalogProgram } from "@/lib/catalog/queries";

/** Неделя программы: дни, шаблон дня и его упражнения (подходы × повторы). */
export function ProgramWeek({ days }: { days: CatalogProgram["days"] }) {
  return (
    <ul aria-label="Дни недели" className="grid gap-2">
      {days.map((d) => (
        <li key={d.weekday} className="rounded-xl border bg-card p-4">
          <div className="flex items-baseline gap-3">
            <span className="w-8 text-sm font-bold text-primary">{WEEKDAYS_SHORT[d.weekday]}</span>
            <h3 className="font-semibold">{d.title}</h3>
          </div>
          {d.exercises.length ? (
            <ul className="mt-2 grid gap-1 pl-11 text-sm text-muted-foreground">
              {d.exercises.map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{e.name}</span>
                  <span className="tabular-nums">
                    {e.sets} × {e.reps}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

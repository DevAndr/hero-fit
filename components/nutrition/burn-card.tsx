import Link from "next/link";
import { Flame } from "lucide-react";
import type { NutritionView } from "@/lib/nutrition/queries";

const weekday = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });
const n = (v: number) => v.toLocaleString("ru-RU");

/** Расход на тренировках за 7 дней: сумма, столбики по дням, список тренировок (WHOOP — с меткой). */
export function BurnCard({ view, timeZone }: { view: NutritionView; timeZone: string }) {
  const { burn, hasWeight } = view;
  const max = Math.max(1, ...burn.days.map((d) => d.kcal));
  const when = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone });
  return (
    <section aria-label="Расход на тренировках" className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold">
          <Flame className="size-4 text-streak" aria-hidden />
          Расход на тренировках
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          <span data-testid="burn-total" className="text-lg font-bold text-foreground tabular-nums">
            ≈ {n(burn.totalKcal)} ккал
          </span>{" "}
          за 7 дней
        </p>
      </div>
      <div className="flex h-24 items-end gap-2" aria-hidden>
        {burn.days.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.round((d.kcal / max) * 100)}%`, minHeight: d.kcal ? 4 : 0 }} />
            <span className="text-[10px] text-muted-foreground">{weekday.format(new Date(`${d.date}T12:00:00Z`))}</span>
          </div>
        ))}
      </div>
      {!hasWeight ? (
        <p className="text-sm text-muted-foreground">Укажите вес в анкете — без него расход не посчитать.</p>
      ) : burn.workouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">За неделю тренировок не было.</p>
      ) : (
        <ul className="divide-y text-sm">
          {burn.workouts.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2">
              <Link href={`/workouts/${w.id}`} className="truncate hover:underline">
                {w.name} <span className="text-muted-foreground">· {when.format(w.finishedAt)}</span>
              </Link>
              <span className="shrink-0 font-semibold tabular-nums">
                ≈ {n(w.kcal)} ккал
                {w.source === "whoop" ? <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">WHOOP</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Оценка по формулам, не медицинская рекомендация.</p>
    </section>
  );
}

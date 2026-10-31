import { CalorieRing } from "@/components/nutrition/calorie-ring";
import { MacrosSwitch } from "@/components/nutrition/macros-switch";
import { DiaryStreakLine } from "@/components/nutrition/nutrition-today-card";
import { NutritionProfileDialog } from "@/components/nutrition/profile-dialog";
import type { Macros } from "@/lib/nutrition/diary";
import type { Norm } from "@/lib/nutrition/norm";
import type { NutritionView } from "@/lib/nutrition/queries";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("ru-RU");

function Bar({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", over ? "bg-destructive" : "bg-primary")}
        style={{ width: `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%` }}
      />
    </div>
  );
}

/** Итог дня: кольцо калорий (осталось / сверх нормы), съедено и норма, полоски Б/Ж/У; без нормы — только суммы. */
export function DaySummary({
  total,
  norm,
  profile,
  macros: showMacros,
  streak,
}: {
  total: Macros;
  norm: Norm | null;
  profile: NutritionView["profile"];
  macros: boolean;
  /** текущая серия дневника — строка «Серия дневника: N дней» */
  streak: number;
}) {
  const macros = [
    ["Белки", total.protein, norm?.protein],
    ["Жиры", total.fat, norm?.fat],
    ["Углеводы", total.carbs, norm?.carbs],
  ] as const;
  return (
    <section aria-label="Итог дня" className="rounded-xl border bg-card p-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        {norm ? <CalorieRing eaten={total.kcal} norm={norm.kcal} /> : null}
        <div className="w-full min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">{norm ? "Съедено / норма" : "Съедено"}</p>
              <p className="text-xl font-extrabold tabular-nums" data-testid="day-kcal">
                {n(total.kcal)}
                {norm ? ` / ${n(norm.kcal)}` : ""} ккал
              </p>
            </div>
            {norm ? null : <NutritionProfileDialog profile={profile} label="Посчитать норму" variant="outline" />}
          </div>
          {showMacros ? (
            <dl className="grid grid-cols-3 gap-3 text-sm">
              {macros.map(([label, eaten, target]) => (
                <div key={label} className="space-y-1">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-semibold tabular-nums">
                    {n(eaten)}
                    {target !== undefined ? <span className="font-normal text-muted-foreground"> / {n(target)}</span> : null} г
                  </dd>
                  {target !== undefined ? <Bar value={eaten} max={target} /> : null}
                </div>
              ))}
            </dl>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MacrosSwitch on={showMacros} />
            <DiaryStreakLine days={streak} />
          </div>
        </div>
      </div>
    </section>
  );
}

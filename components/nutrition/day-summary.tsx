import { NutritionProfileDialog } from "@/components/nutrition/profile-dialog";
import { balance, type Macros } from "@/lib/nutrition/diary";
import type { Norm } from "@/lib/nutrition/norm";
import type { NutritionView } from "@/lib/nutrition/queries";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("ru-RU");

function Bar({ value, max }: { value: number; max: number }) {
  const over = value > max;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%` }} />
    </div>
  );
}

/** Итог дня: съедено против нормы, «осталось» или «сверх нормы», полоски Б/Ж/У; без нормы — только суммы. */
export function DaySummary({ total, norm, profile }: { total: Macros; norm: Norm | null; profile: NutritionView["profile"] }) {
  const left = norm ? balance(total.kcal, norm.kcal) : null;
  const macros = [
    ["Белки", total.protein, norm?.protein],
    ["Жиры", total.fat, norm?.fat],
    ["Углеводы", total.carbs, norm?.carbs],
  ] as const;
  return (
    <section aria-label="Итог дня" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-extrabold tabular-nums" data-testid="day-kcal">
          {n(total.kcal)}
          {norm ? ` / ${n(norm.kcal)}` : ""} ккал
        </p>
        {left ? (
          <p className={cn("text-sm font-semibold", "over" in left ? "text-destructive" : "text-muted-foreground")}>
            {"over" in left ? `+${n(left.over)} сверх нормы` : `Осталось ${n(left.left)}`}
          </p>
        ) : (
          <NutritionProfileDialog profile={profile} label="Посчитать норму" variant="outline" />
        )}
      </div>
      {norm ? <Bar value={total.kcal} max={norm.kcal} /> : null}
      <dl className="grid grid-cols-3 gap-3 text-sm">
        {macros.map(([label, eaten, target]) => (
          <div key={label} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold tabular-nums">
              {n(eaten)}
              {target !== undefined ? ` / ${n(target)}` : ""} г
            </dd>
            {target !== undefined ? <Bar value={eaten} max={target} /> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

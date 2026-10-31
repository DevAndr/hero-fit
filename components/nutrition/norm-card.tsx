import { Apple } from "lucide-react";
import { NutritionProfileDialog } from "@/components/nutrition/profile-dialog";
import { ACTIVITY_LABELS, GOAL_LABELS } from "@/lib/nutrition/norm";
import type { NutritionView } from "@/lib/nutrition/queries";

const n = (v: number) => v.toLocaleString("ru-RU");

/** Норма на день: ккал, Б/Ж/У и строка расчёта; без анкеты — пустое состояние. */
export function NormCard({ view }: { view: NutritionView }) {
  const { norm, profile } = view;
  if (!norm || !profile.activity || !profile.goal) {
    return (
      <section aria-label="Норма на день" className="flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center">
        <Apple className="size-8 text-primary" aria-hidden />
        <h2 className="font-bold">Посчитаем вашу норму калорий</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Пол, год рождения, рост, вес, активность и цель — и вы увидите дневную норму калорий, белков, жиров и углеводов.
        </p>
        <NutritionProfileDialog profile={profile} label="Заполнить" />
      </section>
    );
  }
  const goal = norm.goalPct === 0 ? "" : ` ${norm.goalPct < 0 ? "−" : "+"} ${Math.abs(norm.goalPct)} % (${GOAL_LABELS[profile.goal].toLowerCase()})`;
  const macros = [
    ["Белки", norm.protein],
    ["Жиры", norm.fat],
    ["Углеводы", norm.carbs],
  ] as const;
  return (
    <section aria-label="Норма на день" className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Норма на день</h2>
          <p className="mt-1 text-3xl font-extrabold tabular-nums">
            <span data-testid="norm-kcal">{n(norm.kcal)}</span> <span className="text-base font-semibold text-muted-foreground">ккал</span>
          </p>
        </div>
        <NutritionProfileDialog profile={profile} label="Изменить данные" variant="outline" />
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {macros.map(([label, grams]) => (
          <div key={label} className="rounded-lg bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{grams} г</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Основной обмен {n(norm.bmr)} × {n(norm.factor)} ({ACTIVITY_LABELS[profile.activity].label.toLowerCase()} активность){goal}
      </p>
    </section>
  );
}

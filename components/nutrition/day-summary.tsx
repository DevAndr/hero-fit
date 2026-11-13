import { CalorieRing } from "@/components/nutrition/calorie-ring";
import { CauldronBar } from "@/components/nutrition/cauldron-bar";
import { DonutRing } from "@/components/nutrition/donut-ring";
import { DiaryStreakLine } from "@/components/nutrition/nutrition-today-card";
import { NutritionProfileDialog } from "@/components/nutrition/profile-dialog";
import { SummaryMenu } from "@/components/nutrition/summary-menu";
import type { Macros } from "@/lib/nutrition/diary";
import type { MealReminderView } from "@/lib/nutrition/reminder-queries";
import type { Norm } from "@/lib/nutrition/norm";
import type { NutritionView } from "@/lib/nutrition/queries";
import type { CalorieBar } from "@/generated/prisma/enums";
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

/**
 * Итог дня: кольцо калорий (осталось / сверх нормы), съедено и норма, полоски Б/Ж/У; без нормы — только суммы.
 * Настройки — в меню «⋮» в углу (`SummaryMenu`): «Белки, жиры, углеводы» и с флагом `nutrition_bar_styles` — «Сменить вид
 * шкалы ккал…» (`CalorieBarDialog`): котёл с зельем во всю ширину (`CauldronBar`, по умолчанию), кольцо или пончик (`DonutRing`);
 * там же «Напоминания…» (`MealRemindersDialog`) — список напоминаний и `canPush` приходят пропсами со страницы.
 */
export function DaySummary({
  date,
  total,
  norm,
  profile,
  macros: showMacros,
  streak,
  bar = null,
  reminders,
  canPush,
}: {
  /** день дневника — у кольца «+N» и отсчёт только в пределах дня */
  date: string;
  total: Macros;
  norm: Norm | null;
  profile: NutritionView["profile"];
  macros: boolean;
  /** текущая серия дневника — строка «Серия дневника: N дней» */
  streak: number;
  /** вид шкалы; null — флага nutrition_bar_styles нет: кольцо и без пункта в меню */
  bar?: CalorieBar | null;
  /** напоминания о приёмах пищи (для окна из меню) */
  reminders: MealReminderView[];
  /** есть куда слать push (подписка или Telegram) */
  canPush: boolean;
}) {
  const macros = [
    ["Белки", total.protein, norm?.protein],
    ["Жиры", total.fat, norm?.fat],
    ["Углеводы", total.carbs, norm?.carbs],
  ] as const;
  return (
    <section aria-label="Итог дня" className="relative rounded-xl border bg-card p-4">
      <div className="absolute top-2 right-2 z-10">
        <SummaryMenu macros={showMacros} bar={norm ? bar : null} eaten={total.kcal} norm={norm?.kcal ?? null} reminders={reminders} canPush={canPush} />
      </div>
      {norm && bar === "CAULDRON" ? (
        <div className="mx-auto mb-2 max-w-xl">
          <CauldronBar eaten={total.kcal} norm={norm.kcal} day={date} />
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        {norm && bar === "DONUT" ? <DonutRing eaten={total.kcal} norm={norm.kcal} day={date} /> : null}
        {norm && (bar === null || bar === "RING") ? <CalorieRing eaten={total.kcal} norm={norm.kcal} day={date} /> : null}
        <div className="w-full min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pr-8">
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
          <DiaryStreakLine days={streak} />
        </div>
      </div>
    </section>
  );
}

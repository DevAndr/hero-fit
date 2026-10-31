"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FoodEntryDialog } from "@/components/nutrition/food-entry-dialog";
import { MEAL_LABELS, type Macros, type Meal } from "@/lib/nutrition/diary";
import { copyFoodEntryToTodayAction, deleteFoodEntryAction, repeatYesterdayMealAction, restoreFoodEntryAction } from "@/lib/nutrition/food-actions";
import type { FoodEntryRow, RecentFood } from "@/lib/nutrition/food-queries";

const n = (v: number) => v.toLocaleString("ru-RU");

function macrosLine(e: FoodEntryRow) {
  return [
    ["Б", e.protein],
    ["Ж", e.fat],
    ["У", e.carbs],
  ]
    .filter((p): p is [string, number] => p[1] !== null)
    .map(([k, v]) => `${k} ${n(v)}`)
    .join(" · ");
}

/** Блок приёма пищи: сумма, записи с меню, «Добавить», у пустого — «Повторить вчерашний». */
export function MealBlock({
  meal,
  entries,
  totals,
  date,
  isToday,
  canRepeat,
  recents,
  macros,
}: {
  meal: Meal;
  entries: FoodEntryRow[];
  totals: Macros;
  date: string;
  isToday: boolean;
  canRepeat: boolean;
  recents: RecentFood[];
  /** продвинутый ввод: строка Б/Ж/У у записей и поля в диалоге */
  macros: boolean;
}) {
  const [dialog, setDialog] = useState<{ entry?: FoodEntryRow } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const label = MEAL_LABELS[meal];
  // Ошибка сети или снятый флаг — уведомлением, а не страницей ошибки
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try {
        await fn();
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  const remove = (e: FoodEntryRow) =>
    run(async () => {
      const deleted = await deleteFoodEntryAction(e.id);
      if (deleted) toast(`Удалено: ${deleted.name}`, { action: { label: "Отменить", onClick: () => run(() => restoreFoodEntryAction(deleted)) } });
    });

  return (
    <section aria-label={label} className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">{label}</h2>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{n(totals.kcal)} ккал</span>
      </div>
      {entries.length ? (
        <ul className="divide-y text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate">{e.name}</p>
                {macros && macrosLine(e) ? <p className="text-xs text-muted-foreground">{macrosLine(e)}</p> : null}
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{n(e.kcal)} ккал</span>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Действия: ${e.name}`} disabled={pending} />}>
                  <EllipsisVertical />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ entry: e })}>Изменить</DropdownMenuItem>
                  {isToday ? null : (
                    <DropdownMenuItem
                      onClick={() =>
                        run(async () => {
                          await copyFoodEntryToTodayAction(e.id);
                          // Копия ушла в другой день — без подтверждения не видно, что сработало
                          toast.success("Добавлено в сегодня", { action: { label: "Открыть", onClick: () => router.push("/nutrition") } });
                        })
                      }
                    >
                      Добавить сегодня
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => remove(e)}>
                    Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => setDialog({})}>
          <Plus />
          Добавить
        </Button>
        {!entries.length && canRepeat ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => repeatYesterdayMealAction(date, meal))}>
            <Repeat />
            Повторить вчерашний
          </Button>
        ) : null}
      </div>
      {dialog ? (
        <FoodEntryDialog open onOpenChange={(o) => !o && setDialog(null)} date={date} meal={meal} entry={dialog.entry} recents={recents} macros={macros} />
      ) : null}
    </section>
  );
}

"use client";

import { useActionState, useRef, useState } from "react";
import { Apple, ArrowLeft, Coffee, Loader2, Moon, Soup, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { selectOnFocus } from "@/components/ui/select-on-focus";
import { MEAL_LABELS, MEALS, type Meal } from "@/lib/nutrition/diary";
import { addFoodEntryAction, updateFoodEntryAction, type FoodFormState } from "@/lib/nutrition/food-actions";
import type { FoodEntryRow, RecentFood } from "@/lib/nutrition/food-queries";

type Field = "name" | "kcal" | "protein" | "fat" | "carbs";
const FIELDS: { name: Field; label: string; mode?: "numeric" | "decimal" }[] = [
  { name: "name", label: "Название" },
  { name: "kcal", label: "Ккал", mode: "numeric" },
  { name: "protein", label: "Белки, г", mode: "decimal" },
  { name: "fat", label: "Жиры, г", mode: "decimal" },
  { name: "carbs", label: "Углеводы, г", mode: "decimal" },
];

// Шаг 1 — по ходу дня (у блоков на странице свой порядок, MEALS)
const STEP_MEALS: { meal: Meal; icon: LucideIcon }[] = [
  { meal: "BREAKFAST", icon: Coffee },
  { meal: "SNACK", icon: Apple },
  { meal: "LUNCH", icon: Soup },
  { meal: "DINNER", icon: Moon },
];

const shown = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/**
 * Изменить запись `entry` (один экран с выбором приёма) или добавить в день `date` по шагам:
 * 1 — приём (пропускается, если `meal` задан — кнопка блока), 2 — название и ккал (Б/Ж/У при `macros`); «Недавние» заполняют поля.
 */
export function FoodEntryDialog({
  open,
  onOpenChange,
  date,
  meal,
  entry,
  recents,
  macros,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** приём заранее (кнопка блока) — сразу шаг 2; без него — с шага 1 */
  meal?: Meal;
  entry?: FoodEntryRow;
  recents: RecentFood[];
  /** без продвинутого ввода Б/Ж/У уходят скрытыми полями — правка ккал их не стирает */
  macros: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FoodFormState, FormData>(async (prev, formData) => {
    const result = entry ? await updateFoodEntryAction(entry.id, prev, formData) : await addFoodEntryAction(date, prev, formData);
    if (result.ok) onOpenChange(false);
    return result;
  }, {});
  const [chosen, setChosen] = useState<Meal | null>(meal ?? null);

  const fill = (r: RecentFood) => {
    const form = formRef.current;
    if (!form) return;
    for (const { name } of FIELDS) (form.elements.namedItem(name) as HTMLInputElement).value = shown(r[name]);
  };

  if (!entry && !chosen) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Какой приём пищи?</DialogTitle>
            <DialogDescription>Шаг 1 из 2</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {STEP_MEALS.map(({ meal: m, icon: Icon }) => (
              <Button key={m} type="button" variant="outline" className="h-20 flex-col gap-1.5 text-base" onClick={() => setChosen(m)}>
                <Icon className="size-6" />
                {MEAL_LABELS[m]}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Изменить запись" : `Добавить: ${MEAL_LABELS[chosen!]}`}</DialogTitle>
          {entry ? null : <DialogDescription>Шаг 2 из 2</DialogDescription>}
        </DialogHeader>
        {!entry && recents.length ? (
          <div role="group" aria-label="Недавние" className="flex flex-wrap gap-2">
            {recents.map((r) => (
              <Button key={r.name} type="button" size="sm" variant="outline" onClick={() => fill(r)}>
                {r.name}
              </Button>
            ))}
          </div>
        ) : null}
        <form ref={formRef} action={action} className="space-y-4">
          {entry ? (
            <RadioGroup name="meal" aria-label="Приём пищи" defaultValue={state.values?.meal ?? entry.meal} className="grid-cols-2">
              {MEALS.map((m) => (
                <label
                  key={m}
                  className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm whitespace-nowrap transition-colors hover:bg-muted has-data-checked:border-primary has-data-checked:bg-primary/10"
                >
                  <RadioGroupItem value={m} aria-label={MEAL_LABELS[m]} />
                  {MEAL_LABELS[m]}
                </label>
              ))}
            </RadioGroup>
          ) : (
            <input type="hidden" name="meal" value={chosen!} />
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.filter((f) => macros || f.name === "name" || f.name === "kcal").map(({ name, label, mode }) => (
              <div key={name} className={name === "name" ? "col-span-2 space-y-1.5 sm:col-span-4" : "space-y-1.5"}>
                <Label htmlFor={`food-${name}`}>{label}</Label>
                <Input
                  id={`food-${name}`}
                  name={name}
                  inputMode={mode}
                  maxLength={name === "name" ? 80 : undefined}
                  defaultValue={state.values?.[name] ?? shown(entry?.[name])}
                  {...(mode ? selectOnFocus : {})}
                />
                {state.errors?.[name]?.length ? <p className="text-sm text-destructive">{state.errors[name][0]}</p> : null}
              </div>
            ))}
          </div>
          {macros
            ? null
            : (["protein", "fat", "carbs"] as const).map((name) => <input key={name} type="hidden" name={name} defaultValue={state.values?.[name] ?? shown(entry?.[name])} />)}
          <DialogFooter>
            {entry ? null : (
              <Button type="button" variant="outline" onClick={() => setChosen(null)} disabled={pending}>
                <ArrowLeft />
                Назад
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useActionState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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

const shown = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Добавить запись в приём дня `date` или изменить запись `entry`; «Недавние» заполняют поля. */
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
  meal: Meal;
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

  const fill = (r: RecentFood) => {
    const form = formRef.current;
    if (!form) return;
    for (const { name } of FIELDS) (form.elements.namedItem(name) as HTMLInputElement).value = shown(r[name]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Изменить запись" : `Добавить: ${MEAL_LABELS[meal]}`}</DialogTitle>
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
          <RadioGroup name="meal" aria-label="Приём пищи" defaultValue={state.values?.meal ?? entry?.meal ?? meal} className="grid-cols-2">
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

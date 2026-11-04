"use client";

import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { CalorieRing } from "@/components/nutrition/calorie-ring";
import { CauldronBar } from "@/components/nutrition/cauldron-bar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setNutritionCauldronAction } from "@/lib/nutrition/actions";
import { cn } from "@/lib/utils";

/**
 * «Вид шкалы калорий» (флаг nutrition_cauldron): две карточки с живым превью на сегодняшних цифрах — котёл с зельем и
 * кольцо; нажатие сохраняет выбор и закрывает диалог.
 */
export function CalorieBarDialog({
  open,
  onOpenChange,
  cauldron,
  eaten,
  norm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cauldron: boolean;
  eaten: number;
  norm: number;
}) {
  const [value, setValue] = useOptimistic(cauldron);
  const [pending, start] = useTransition();
  const choose = (next: boolean) => {
    onOpenChange(false);
    if (next === cauldron) return;
    start(async () => {
      setValue(next);
      try {
        await setNutritionCauldronAction(next);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  };
  const options = [
    { on: true, title: "Котёл с зельем", preview: <CauldronBar eaten={eaten} norm={norm} day="preview" /> },
    { on: false, title: "Кольцо", preview: <CalorieRing eaten={eaten} norm={norm} size="sm" /> },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Вид шкалы калорий</DialogTitle>
          <DialogDescription>Как показывать съеденное за день в «Итоге дня».</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {options.map(({ on, title, preview }) => {
            const selected = value === on;
            return (
              <button
                key={title}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => choose(on)}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60",
                  selected && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {title}
                  {selected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <Check className="size-3.5" aria-hidden />
                      Сейчас
                    </span>
                  ) : null}
                </span>
                {/* Превью — картинка без своих подписей для скринридера: имя кнопки — название вида */}
                <span aria-hidden className="pointer-events-none flex min-h-24 items-center justify-center">
                  {preview}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

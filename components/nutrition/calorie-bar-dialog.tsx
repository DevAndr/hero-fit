"use client";

import { useOptimistic, useTransition, type ReactNode } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { CalorieRing } from "@/components/nutrition/calorie-ring";
import { CauldronBar } from "@/components/nutrition/cauldron-bar";
import { DonutRing } from "@/components/nutrition/donut-ring";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CalorieBar } from "@/generated/prisma/enums";
import { setNutritionBarAction } from "@/lib/nutrition/actions";
import { cn } from "@/lib/utils";

/**
 * «Вид шкалы калорий» (флаг nutrition_bar_styles): карточки с живым превью на цифрах дня — котёл с зельем (во всю
 * ширину), кольцо и пончик (рядом); нажатие сохраняет выбор и закрывает диалог.
 */
export function CalorieBarDialog({
  open,
  onOpenChange,
  bar,
  eaten,
  norm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bar: CalorieBar;
  eaten: number;
  norm: number;
}) {
  const [value, setValue] = useOptimistic(bar);
  const [pending, start] = useTransition();
  const choose = (next: CalorieBar) => {
    onOpenChange(false);
    if (next === bar) return;
    start(async () => {
      setValue(next);
      try {
        await setNutritionBarAction(next);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  };
  const options: { bar: CalorieBar; title: string; wide?: boolean; preview: ReactNode }[] = [
    { bar: "CAULDRON", title: "Котёл с зельем", wide: true, preview: <CauldronBar eaten={eaten} norm={norm} day="preview" /> },
    { bar: "RING", title: "Кольцо", preview: <CalorieRing eaten={eaten} norm={norm} size="sm" /> },
    { bar: "DONUT", title: "Пончик", preview: <DonutRing eaten={eaten} norm={norm} day="preview" size="sm" /> },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Вид шкалы калорий</DialogTitle>
          <DialogDescription>Как показывать съеденное за день в «Итоге дня».</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {options.map((o) => {
            const selected = value === o.bar;
            return (
              <button
                key={o.bar}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => choose(o.bar)}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60",
                  o.wide && "col-span-2",
                  selected && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                  {o.title}
                  {selected ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <Check className="size-3.5" aria-hidden />
                      Сейчас
                    </span>
                  ) : null}
                </span>
                {/* Превью — картинка без своих подписей для скринридера: имя кнопки — название вида */}
                <span aria-hidden className="pointer-events-none flex min-h-24 items-center justify-center">
                  {o.preview}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

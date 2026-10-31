"use client";

import { useState, useTransition } from "react";
import { Flame, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { setNutritionMacrosAction } from "@/lib/nutrition/actions";

const MODES = [
  { macros: false, icon: Flame, title: "Упрощённый — только калории", hint: "Быстро: название и ккал" },
  { macros: true, icon: ListChecks, title: "Продвинутый — калории и БЖУ", hint: "Белки, жиры и углеводы в записях и норме" },
] as const;

/** Первый заход на /nutrition: выбор режима ввода; закрыли без выбора — упрощённый (больше не спрашиваем). */
export function NutritionModeDialog() {
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();
  const choose = (macros: boolean) => {
    setOpen(false);
    start(async () => {
      try {
        await setNutritionMacrosAction(macros);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && choose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Как будете вести дневник?</DialogTitle>
          <DialogDescription>Поменять можно в любой момент — переключателем в «Итоге дня».</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {MODES.map(({ macros, icon: Icon, title, hint }) => (
            <button
              key={title}
              type="button"
              disabled={pending}
              onClick={() => choose(macros)}
              className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors outline-none hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

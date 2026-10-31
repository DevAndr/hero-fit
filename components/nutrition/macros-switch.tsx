"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setNutritionMacrosAction } from "@/lib/nutrition/actions";

/** «Белки, жиры, углеводы»: продвинутый ввод (Б/Ж/У) или только ккал; сохраняется сразу. */
export function MacrosSwitch({ on }: { on: boolean }) {
  const [value, setValue] = useOptimistic(on);
  const [, start] = useTransition();
  const change = (next: boolean) =>
    start(async () => {
      setValue(next);
      try {
        await setNutritionMacrosAction(next);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  return (
    <div className="flex items-center gap-2">
      <Switch id="nutrition-macros" checked={value} onCheckedChange={change} />
      <Label htmlFor="nutrition-macros" className="text-sm font-normal text-muted-foreground">
        Белки, жиры, углеводы
      </Label>
    </div>
  );
}

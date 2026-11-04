"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setNutritionCauldronAction } from "@/lib/nutrition/actions";

/** «Котёл вместо кольца» (флаг nutrition_cauldron): шкала калорий в «Итоге дня» — котёл с зельем или кольцо; сохраняется сразу. */
export function CauldronSwitch({ on }: { on: boolean }) {
  const [value, setValue] = useOptimistic(on);
  const [, start] = useTransition();
  const change = (next: boolean) =>
    start(async () => {
      setValue(next);
      try {
        await setNutritionCauldronAction(next);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  return (
    <div className="flex items-center gap-2">
      <Switch id="nutrition-cauldron" checked={value} onCheckedChange={change} />
      <Label htmlFor="nutrition-cauldron" className="text-sm font-normal text-muted-foreground">
        Котёл вместо кольца
      </Label>
    </div>
  );
}

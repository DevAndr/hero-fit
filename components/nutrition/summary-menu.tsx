"use client";

import { useOptimistic, useState, useTransition } from "react";
import { EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import { CalorieBarDialog } from "@/components/nutrition/calorie-bar-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setNutritionMacrosAction } from "@/lib/nutrition/actions";

/**
 * Меню «⋮» в углу «Итога дня»: «Белки, жиры, углеводы» (режим ввода, сохраняется сразу) и — с флагом nutrition_cauldron
 * и посчитанной нормой — «Сменить вид шкалы ккал…» (диалог выбора котёл / кольцо с превью).
 */
export function SummaryMenu({
  macros,
  cauldron,
  eaten,
  norm,
}: {
  macros: boolean;
  /** выбранная шкала; null — выбора нет (флаг выключен или нет нормы) */
  cauldron: boolean | null;
  eaten: number;
  norm: number | null;
}) {
  const [value, setValue] = useOptimistic(macros);
  const [, start] = useTransition();
  const [barOpen, setBarOpen] = useState(false);
  const changeMacros = (next: boolean) =>
    start(async () => {
      setValue(next);
      try {
        await setNutritionMacrosAction(next);
      } catch {
        toast.error("Не удалось сохранить — проверьте связь");
      }
    });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Настройки итога дня" />}>
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuCheckboxItem checked={value} onCheckedChange={changeMacros}>
            Белки, жиры, углеводы
          </DropdownMenuCheckboxItem>
          {cauldron !== null && norm !== null ? <DropdownMenuItem onClick={() => setBarOpen(true)}>Сменить вид шкалы ккал…</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {cauldron !== null && norm !== null ? (
        <CalorieBarDialog open={barOpen} onOpenChange={setBarOpen} cauldron={cauldron} eaten={eaten} norm={norm} />
      ) : null}
    </>
  );
}

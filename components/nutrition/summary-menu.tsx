"use client";

import { useOptimistic, useState, useTransition } from "react";
import { EllipsisVertical } from "lucide-react";
import { toast } from "sonner";
import { CalorieBarDialog } from "@/components/nutrition/calorie-bar-dialog";
import { MealRemindersDialog } from "@/components/nutrition/meal-reminders-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CalorieBar } from "@/generated/prisma/enums";
import { setNutritionMacrosAction } from "@/lib/nutrition/actions";
import type { MealReminderView } from "@/lib/nutrition/reminder-queries";

/**
 * Меню «⋮» в углу «Итога дня»: «Белки, жиры, углеводы» (режим ввода, сохраняется сразу) и — с флагом nutrition_bar_styles
 * и посчитанной нормой — «Сменить вид шкалы ккал…» (диалог выбора котёл / кольцо / пончик с превью); последним, всегда —
 * «Напоминания…» (окно напоминаний о приёмах пищи, `MealRemindersDialog`).
 */
export function SummaryMenu({
  macros,
  bar,
  eaten,
  norm,
  reminders,
  canPush,
}: {
  macros: boolean;
  /** выбранная шкала; null — выбора нет (флаг выключен или нет нормы) */
  bar: CalorieBar | null;
  eaten: number;
  norm: number | null;
  /** напоминания о приёмах пищи по возрастанию времени */
  reminders: MealReminderView[];
  /** есть куда слать push (подписка или Telegram) — иначе в окне подсказка про уведомления */
  canPush: boolean;
}) {
  const [value, setValue] = useOptimistic(macros);
  const [, start] = useTransition();
  const [barOpen, setBarOpen] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
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
          {bar !== null && norm !== null ? <DropdownMenuItem onClick={() => setBarOpen(true)}>Сменить вид шкалы ккал…</DropdownMenuItem> : null}
          <DropdownMenuItem onClick={() => setRemindersOpen(true)}>Напоминания…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {bar !== null && norm !== null ? (
        <CalorieBarDialog open={barOpen} onOpenChange={setBarOpen} bar={bar} eaten={eaten} norm={norm} />
      ) : null}
      <MealRemindersDialog open={remindersOpen} onOpenChange={setRemindersOpen} reminders={reminders} canPush={canPush} />
    </>
  );
}

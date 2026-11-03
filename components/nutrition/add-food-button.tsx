"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FoodEntryDialog } from "@/components/nutrition/food-entry-dialog";
import type { RecentFood } from "@/lib/nutrition/food-queries";

/** Главная кнопка дневника: окно записи с шага 1 (выбор приёма). */
export function AddFoodButton({ date, recents, macros }: { date: string; recents: RecentFood[]; macros: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        <Plus />
        Добавить приём пищи
      </Button>
      {/* Монтируем только открытым — каждый раз снова с шага 1 и с пустыми полями */}
      {open ? <FoodEntryDialog open onOpenChange={setOpen} date={date} recents={recents} macros={macros} /> : null}
    </>
  );
}

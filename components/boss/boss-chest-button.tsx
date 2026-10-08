"use client";

import { useState } from "react";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openBossChestAction } from "@/lib/boss/actions";
import { cn } from "@/lib/utils";

/**
 * Кнопка «Открыть сундук босса» с диалогом; после открытия исчезает.
 * Держать смонтированной и после того, как `available` стал false: открытие обновляет страницу (revalidatePath),
 * и диалог с наградой не должен пропасть вместе с кнопкой.
 */
export function BossChestButton({ week, name, available, className }: { week: string; name: string; available: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState(false);
  return (
    <>
      {taken || !available ? null : (
        <Button size="sm" className={cn("bg-amber-400 hover:bg-amber-300", className)} onClick={() => setOpen(true)}>
          Открыть сундук босса
        </Button>
      )}
      <ChestDialog
        open={open}
        onOpenChange={(next) => setOpen(next)}
        title="Сундук босса"
        description={`Награда за победу: ${name}`}
        openedDescription="Каждую неделю — новый босс"
        onOpen={() => openBossChestAction(week)}
        onOpened={() => setTaken(true)}
      />
    </>
  );
}

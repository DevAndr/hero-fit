"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openGoalChestAction } from "@/lib/goals/actions";
import { cn } from "@/lib/utils";

/**
 * «Открыть сундук» за выполненную цель. Действие страницу не обновляет (цель ушла бы в историю вместе с диалогом) —
 * обновляем сами, когда закрыт диалог с открытым сундуком.
 */
export function GoalChestButton({ goalId, title, available, className }: { goalId: string; title: string; available: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState(false);
  const router = useRouter();
  return (
    <>
      {taken || !available ? null : (
        <Button size="sm" className={cn("bg-amber-400 hover:bg-amber-300", className)} onClick={() => setOpen(true)}>
          Открыть сундук
        </Button>
      )}
      <ChestDialog
        open={open}
        onOpenChange={(next, opened) => {
          setOpen(next);
          if (!next && opened) router.refresh();
        }}
        title="Сундук цели"
        description={`Награда за цель: ${title}`}
        openedDescription="Поставь следующую цель — и снова сундук"
        onOpen={() => openGoalChestAction(goalId)}
        onOpened={() => setTaken(true)}
      />
    </>
  );
}

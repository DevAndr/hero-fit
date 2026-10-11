"use client";

import { useState } from "react";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openRaidChestAction } from "@/lib/raid/actions";
import type { RaidView } from "@/lib/raid/queries";
import { cn } from "@/lib/utils";

/**
 * «Открыть сундук рейда» с диалогом; после открытия кнопка исчезает.
 * Держать смонтированной и после открытия: revalidatePath обновит страницу, диалог с наградой не должен пропасть.
 */
export function RaidChestButton({ reward, className }: { reward: RaidView["myReward"]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState(false);
  // Последняя показанная награда: после открытия страница обновится без неё, а диалог должен досмотреть свою
  const [shown, setShown] = useState(reward);
  if (reward && reward.raidId !== shown?.raidId) {
    setShown(reward);
    setTaken(false);
  }
  if (!shown) return null;
  const { raidId, name, mvp } = shown;
  return (
    <>
      {taken || !reward ? null : (
        <Button size="sm" className={cn("bg-amber-400 hover:bg-amber-300", className)} onClick={() => setOpen(true)}>
          Открыть сундук рейда
        </Button>
      )}
      <ChestDialog
        open={open}
        onOpenChange={(next) => setOpen(next)}
        title="Сундук рейда"
        description={`Награда гильдии за победу: ${name}${mvp ? " · вы MVP рейда" : ""}`}
        openedDescription="В понедельник придёт новый рейд-босс"
        onOpen={() => openRaidChestAction(raidId)}
        onOpened={() => setTaken(true)}
      />
    </>
  );
}

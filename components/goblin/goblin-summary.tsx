"use client";

import Image from "next/image";
import { useState } from "react";
import goblinSprite from "@/assets/icons/game/bosses/gold_goblin.png";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openGoblinChestAction } from "@/lib/goblin/actions";
import { GOBLIN_REWARD_XP } from "@/lib/goblin/rules";
import { cn } from "@/lib/utils";

/** Итоги тренировки: Золотой гоблин пойман (сундук) или ушёл. */
export function GoblinSummary({ goblin, opened, readOnly }: { goblin: { id: string; caught: boolean }; opened: boolean; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [taken, setTaken] = useState(opened);
  return (
    <section
      aria-label="Золотой гоблин"
      className={cn("mt-4 flex items-center gap-3 rounded-xl border p-4", goblin.caught ? "border-amber-400/50 bg-amber-400/10" : "bg-card")}
    >
      <Image src={goblinSprite} alt="" className={cn("h-16 w-auto shrink-0", !goblin.caught && "opacity-40 grayscale")} sizes="56px" />
      <div className="min-w-0 flex-1">
        <h2 className="font-bold">{goblin.caught ? "🪙 Золотой гоблин пойман!" : "Золотой гоблин ушёл"}</h2>
        {goblin.caught ? (
          taken || readOnly ? (
            <p className="text-sm text-muted-foreground">Сундук открыт · +{GOBLIN_REWARD_XP} XP</p>
          ) : (
            <Button size="sm" className="mt-2 bg-amber-400 hover:bg-amber-300" onClick={() => setOpen(true)}>
              Открыть сундук гоблина
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Не хватило подходов за 10 минут — в следующий раз повезёт</p>
        )}
      </div>
      {goblin.caught && !readOnly ? (
        <ChestDialog
          open={open}
          onOpenChange={setOpen}
          title="Сундук гоблина"
          description="Награда за Золотого гоблина"
          openedDescription="Гоблины попадаются редко — не пропускай тренировки"
          onOpen={() => openGoblinChestAction(goblin.id)}
          onOpened={() => setTaken(true)}
        />
      ) : null}
    </section>
  );
}

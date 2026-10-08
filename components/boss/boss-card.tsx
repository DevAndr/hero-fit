"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { BossSprite } from "@/components/boss/boss-sprite";
import { ChestDialog } from "@/components/progress/chest-dialog";
import { Button } from "@/components/ui/button";
import { openBossChestAction } from "@/lib/boss/actions";
import { SET_DAMAGE } from "@/lib/boss/damage";
import type { BossView } from "@/lib/boss/queries";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Полоса здоровья босса (общая для дашборда и редактора). */
export function BossHpBar({ hp, left, name, className }: { hp: number; left: number; name: string; className?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={`Здоровье: ${name}`}
      aria-valuemin={0}
      aria-valuemax={hp}
      aria-valuenow={left}
      className={cn("h-2.5 overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full rounded-full bg-streak transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${hp ? (left / hp) * 100 : 0}%` }}
      />
    </div>
  );
}

/** Карточка «Босс недели» на дашборде: HP, сколько подходов осталось, победа и сундук. */
export function BossCard({ boss }: { boss: BossView }) {
  const [chestOpen, setChestOpen] = useState(false);
  const [rewardTaken, setRewardTaken] = useState(false);
  const left = Math.max(0, boss.hp - boss.damage);
  const defeated = boss.defeatedAt !== null;
  const setsLeft = Math.ceil(left / SET_DAMAGE);

  return (
    <section aria-label="Босс недели" className="rounded-xl border bg-card p-4" data-testid="boss-card">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <p className="flex items-center gap-2">
          <Swords className="size-4 text-streak" />
          Босс недели
        </p>
        {defeated ? null : (
          <p className="text-xs">
            {boss.daysLeft <= 1 ? "последний день недели" : `до конца недели ${boss.daysLeft} ${plural(boss.daysLeft, "день", "дня", "дней")}`}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <BossSprite code={boss.code} defeated={defeated} size={88} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-bold">{boss.name}</p>
          <BossHpBar hp={boss.hp} left={left} name={boss.name} />
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="font-semibold">
              {left} / {boss.hp} HP
            </span>
            {defeated ? (
              <span className="ml-2 font-bold text-primary">Повержен!</span>
            ) : boss.damage === 0 ? (
              <span className="block text-xs text-muted-foreground">{boss.name} ждёт. Первый подход — первый удар</span>
            ) : (
              <span className="text-muted-foreground">
                {" "}
                · осталось ~{setsLeft} {plural(setsLeft, "подход", "подхода", "подходов")}
              </span>
            )}
          </p>
          {defeated && !boss.rewardOpened && !rewardTaken ? (
            <Button size="sm" className="bg-amber-400 hover:bg-amber-300" onClick={() => setChestOpen(true)}>
              Открыть сундук босса
            </Button>
          ) : null}
        </div>
      </div>

      <ChestDialog
        open={chestOpen}
        onOpenChange={(next) => setChestOpen(next)}
        title="Сундук босса"
        description={`Награда за победу: ${boss.name}`}
        openedDescription="В понедельник придёт новый босс"
        onOpen={() => openBossChestAction(boss.week)}
        onOpened={() => setRewardTaken(true)}
      />
    </section>
  );
}

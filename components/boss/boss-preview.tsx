"use client";

import type { ReactNode } from "react";
import { Stat } from "@/components/boss/boss-details";
import { BossViewer } from "@/components/boss/boss-viewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { bossLore } from "@/lib/boss/bosses";
import type { BossView } from "@/lib/boss/queries";

/** Иконка босса в тренировке открывает диалог: картинка крупно, описание, остаток HP и урон недели с этой тренировкой. */
export function BossPreview({ boss, left, current, children }: { boss: BossView; left: number; current: number; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`${boss.name}: подробнее`}
            className="block cursor-pointer rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        {children}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" data-testid="boss-preview">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">{boss.name}</DialogTitle>
          <DialogDescription>{bossLore(boss.code)}</DialogDescription>
        </DialogHeader>

        <BossViewer code={boss.code} />

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Stat label="Здоровье" value={`${left} / ${boss.hp}`} />
          <Stat label="Урон за неделю" value={String(boss.damage + current)} />
        </dl>
      </DialogContent>
    </Dialog>
  );
}

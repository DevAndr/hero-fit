"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerAvatar } from "@/components/shop/player-avatar";
import { PlayerName } from "@/components/shop/player-name";
import { buyItemAction, equipItemAction } from "@/lib/shop/actions";
import type { ShopItem } from "@/lib/shop/catalog";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { RARITY_LABELS } from "@/lib/shop/view";
import { haptic } from "@/lib/telegram/webapp";

/** Превью предмета на самом игроке: тема — кнопка и полоска в её цветах (светлой и тёмной). */
export function ItemPreview({ item, display, equipped }: { item: ShopItem; display: string; equipped: Cosmetics }) {
  if (item.kind === "theme") {
    return (
      <div className="grid grid-cols-2 gap-2" data-testid="theme-preview">
        {([item.light, item.dark] as const).map((t, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-3" style={{ background: i === 0 ? "#ffffff" : "#0b0b0f" }}>
            <span className="inline-block rounded-md px-3 py-1 text-xs font-semibold" style={{ background: t.primary, color: t.primaryForeground }}>
              Кнопка
            </span>
            <div className="h-2 rounded-full" style={{ background: t.chart1 }} />
          </div>
        ))}
      </div>
    );
  }
  const preview: Cosmetics = {
    ...equipped,
    avatar: item.kind === "avatar" ? item.code : equipped.avatar,
    frame: item.kind === "frame" ? item.code : equipped.frame,
    nickColor: item.kind === "nickColor" ? item.code : equipped.nickColor,
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <PlayerAvatar nickname={display} cosmetics={preview} size="lg" labelled />
      <PlayerName nickname={display} color={preview.nickColor} className="text-lg font-semibold" />
    </div>
  );
}

/** Карточка предмета: превью, «Купить за N» → «Надеть» / «Снять». */
export function ItemDialog({
  item,
  owned,
  isEquipped,
  coins,
  display,
  equipped,
  onClose,
}: {
  item: ShopItem | null;
  owned: boolean;
  isEquipped: boolean;
  coins: number;
  display: string;
  equipped: Cosmetics;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) =>
    start(async () => {
      setError(null);
      const res = await fn().catch(() => ({ ok: false as const, error: "Не получилось, попробуй ещё раз" }));
      if (!res.ok) {
        setError(res.error ?? "Не получилось");
        return;
      }
      if (success) {
        haptic("success");
        toast.success(success);
      }
    });

  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && (setError(null), onClose())}>
      <DialogContent className="sm:max-w-sm">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>{item.name}</DialogTitle>
              <DialogDescription>{RARITY_LABELS[item.rarity]}</DialogDescription>
            </DialogHeader>
            <ItemPreview item={item} display={display} equipped={equipped} />
            {!owned && coins < item.price ? <p className="text-sm text-muted-foreground">Не хватает {item.price - coins}</p> : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              {owned ? (
                isEquipped ? (
                  <Button variant="outline" className="w-full" disabled={pending} onClick={() => run(() => equipItemAction(item.kind, null))}>
                    Снять
                  </Button>
                ) : (
                  <Button className="w-full" disabled={pending} onClick={() => run(() => equipItemAction(item.kind, item.code))}>
                    Надеть
                  </Button>
                )
              ) : (
                <Button
                  className="w-full"
                  disabled={pending || coins < item.price}
                  onClick={() => run(() => buyItemAction(item.code), `Куплено: ${item.name}`)}
                >
                  Купить за {item.price}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

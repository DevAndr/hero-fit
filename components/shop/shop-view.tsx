"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { CoinHistory } from "@/components/shop/coin-history";
import { EarnDialog } from "@/components/shop/earn-dialog";
import { ItemDialog, ItemPreview } from "@/components/shop/item-dialog";
import { RetroBanner } from "@/components/shop/retro-banner";
import { reachGoal } from "@/lib/analytics/reach";
import { DEFAULT_THEME, itemByCode, shopItems, type ItemKind, type ShopItem } from "@/lib/shop/catalog";
import type { Cosmetics } from "@/lib/shop/cosmetics";
import { coinWord } from "@/lib/shop/labels";
import type { ShopData } from "@/lib/shop/queries";
import { KIND_TABS, RARITY_LABELS } from "@/lib/shop/view";
import { cn } from "@/lib/utils";

/** Магазин: баланс, вкладки по видам, карточки предметов, история. */
export function ShopView({ tab, data, display, timeZone }: { tab: ItemKind; data: ShopData; display: string; timeZone: string }) {
  const [openCode, setOpenCode] = useState<string | null>(null);

  useEffect(() => {
    reachGoal("shop_open");
  }, []);

  const owned = new Set(data.owned);
  // У тем первая карточка — «Стандартная»: вернуть фирменную тему (надета, когда своей темы нет)
  const items = tab === "theme" ? [DEFAULT_THEME, ...shopItems(tab)] : shopItems(tab);
  const open = openCode === DEFAULT_THEME.code ? DEFAULT_THEME : itemByCode(openCode);
  const isOwned = (i: ShopItem) => i.acquire === "free" || owned.has(i.code);
  const isWorn = (i: ShopItem) => (i.code === DEFAULT_THEME.code ? !itemByCode(data.equipped.theme) : data.equipped[i.kind] === i.code);
  const equipped: Cosmetics = { avatar: data.equipped.avatar, frame: data.equipped.frame, nickColor: data.equipped.nickColor };

  return (
    <>
      {data.retro ? <RetroBanner amount={data.retro} /> : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-2xl font-black tabular-nums" data-testid="coin-balance">
          <Coins className="size-6 text-xp" aria-hidden />
          {data.coins} <span className="text-base font-semibold text-muted-foreground">{coinWord(data.coins)}</span>
        </p>
        <EarnDialog />
      </div>

      <nav aria-label="Виды предметов" className="mb-4 flex w-fit max-w-full overflow-x-auto rounded-lg bg-muted p-0.5">
        {KIND_TABS.map((t) => (
          <Link
            key={t.kind}
            href={`/shop?tab=${t.kind}`}
            aria-current={tab === t.kind ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground",
              tab === t.kind && "bg-background text-foreground shadow-sm",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => {
          const have = isOwned(item);
          const worn = isWorn(item);
          const short = item.price - data.coins;
          return (
            <li key={item.code}>
              <button
                type="button"
                onClick={() => setOpenCode(item.code)}
                aria-label={item.name}
                data-testid={`shop-item-${item.code}`}
                className="flex h-full w-full flex-col gap-2 rounded-xl border bg-card p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ItemPreview item={item} display={display} equipped={equipped} />
                <span className="font-semibold">{item.name}</span>
                <span className="text-xs text-muted-foreground">{RARITY_LABELS[item.rarity]}</span>
                <span className="mt-auto text-sm font-medium">
                  {worn ? "Надето" : item.acquire === "free" ? "Бесплатно" : have ? "Куплено" : short > 0 ? `Не хватает ${short}` : `${item.price} ${coinWord(item.price)}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <ItemDialog
        item={open}
        owned={open ? isOwned(open) : false}
        isEquipped={open ? isWorn(open) : false}
        coins={data.coins}
        display={display}
        equipped={equipped}
        onClose={() => setOpenCode(null)}
      />

      <CoinHistory history={data.history} timeZone={timeZone} />
    </>
  );
}

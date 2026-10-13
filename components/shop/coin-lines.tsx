"use client";

import { Coins } from "lucide-react";
import { useFlag } from "@/components/flags/flags-provider";
import type { CoinLine } from "@/lib/shop/coins";
import { coinWord } from "@/lib/shop/labels";

/** «+N монет» в сводке тренировки — только владельцу с включённым магазином. */
export function CoinLines({ coins }: { coins: { total: number; items: CoinLine[] } }) {
  const shop = useFlag("shop");
  if (!shop || coins.total <= 0) return null;
  return (
    <section className="mt-4 rounded-xl border bg-card p-4" data-testid="summary-coins">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Coins className="size-4 text-xp" />
        Монеты
      </p>
      <p className="mt-1 text-3xl font-black text-xp tabular-nums">
        +{coins.total} {coinWord(coins.total)}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {coins.items.map((c) => (
          <li key={`${c.reason}:${c.label}`}>
            {c.label} · +{c.amount}
          </li>
        ))}
      </ul>
    </section>
  );
}

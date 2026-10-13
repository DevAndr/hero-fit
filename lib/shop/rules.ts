import type { ItemKind, ShopItem } from "@/lib/shop/catalog";

export type BuyCheck = { ok: true } | { ok: false; error: string; short?: number };

function coinWord(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "монеты";
  return "монет";
}

/** Можно ли купить: в продаже только `coins`; уже купленное не покупается; монет хватает. */
export function canBuy(item: ShopItem | null, owned: boolean, coins: number): BuyCheck {
  if (!item || item.acquire !== "coins") return { ok: false, error: "Нет в продаже" };
  if (owned) return { ok: false, error: "Уже куплено" };
  if (coins < item.price) {
    const short = item.price - coins;
    return { ok: false, error: `Не хватает ${short} ${coinWord(short)}`, short };
  }
  return { ok: true };
}

/** Надеть можно предмет своего вида: бесплатный сразу, остальные — если куплены. */
export function canEquip(item: ShopItem | null, kind: ItemKind, owned: boolean): boolean {
  if (!item || item.kind !== kind) return false;
  return item.acquire === "free" || owned;
}

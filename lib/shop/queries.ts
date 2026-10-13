import "server-only";
import type { CoinReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { ItemKind } from "@/lib/shop/catalog";
import { ensureRetroCoins } from "@/lib/shop/retro-db";

export type ShopData = {
  coins: number;
  /** Начисленное при первом заходе (null — не в этот раз). */
  retro: number | null;
  owned: string[];
  equipped: Record<ItemKind, string | null>;
  history: { amount: number; reason: CoinReason; key: string; meta: unknown; createdAt: Date }[];
};

/** Данные страницы магазина: баланс, купленное, надетое и 50 последних записей журнала. */
export async function getShopData(userId: string): Promise<ShopData> {
  const retro = await ensureRetroCoins(userId);
  const [user, items, history] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coins: true, avatarCode: true, frameCode: true, nickColorCode: true, themeCode: true },
    }),
    db.userItem.findMany({ where: { userId }, select: { code: true } }),
    db.coinTx.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { amount: true, reason: true, key: true, meta: true, createdAt: true },
    }),
  ]);
  return {
    coins: user.coins,
    retro: retro > 0 ? retro : null,
    owned: items.map((i) => i.code),
    equipped: { avatar: user.avatarCode, frame: user.frameCode, nickColor: user.nickColorCode, theme: user.themeCode },
    history,
  };
}

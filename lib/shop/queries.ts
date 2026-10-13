import "server-only";
import type { CoinReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { ItemKind } from "@/lib/shop/catalog";
import { ensureRetroCoins } from "@/lib/shop/retro-db";

export type ShopData = {
  coins: number;
  /** Стартовый баланс из журнала (null — нет записи или 0). */
  retro: number | null;
  owned: string[];
  equipped: Record<ItemKind, string | null>;
  history: { amount: number; reason: CoinReason; key: string; meta: unknown; createdAt: Date }[];
};

/** Данные страницы магазина: баланс, купленное, надетое и 50 последних записей журнала. */
export async function getShopData(userId: string): Promise<ShopData> {
  await ensureRetroCoins(userId);
  const [user, items, history, retro] = await Promise.all([
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
    db.coinTx.findUnique({ where: { userId_key: { userId, key: "retro" } }, select: { amount: true } }),
  ]);
  return {
    coins: user.coins,
    retro: retro && retro.amount > 0 ? retro.amount : null,
    owned: items.map((i) => i.code),
    equipped: { avatar: user.avatarCode, frame: user.frameCode, nickColor: user.nickColorCode, theme: user.themeCode },
    history,
  };
}

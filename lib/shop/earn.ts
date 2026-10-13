import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CoinReason } from "@/generated/prisma/enums";
import { levelUpGrants, type CoinGrant, type CoinLine } from "@/lib/shop/coins";
import { grantCoinsDetailed } from "@/lib/shop/coins-db";

export function toLines(grants: CoinGrant[]): CoinLine[] {
  return grants.map((g) => ({ reason: g.reason, amount: g.amount, label: g.label ?? g.key }));
}

/** Сколько тренировок этого местного дня уже оплачено (читать после блокировки строки пользователя). */
export async function paidWorkoutsToday(tx: Prisma.TransactionClient, userId: string, day: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "CoinTx"
    WHERE "userId" = ${userId} AND reason = 'WORKOUT'::"CoinReason" AND meta->>'day' = ${day}`;
  return row?.n ?? 0;
}

/**
 * Монеты за сундук (ключ делает повтор безопасным) плюс уровни, которые принёс его XP.
 * Возвращает всё начисленное.
 */
export async function grantChestCoins(
  tx: Prisma.TransactionClient,
  userId: string,
  chest: { reason: CoinReason; key: string; amount: number; label: string },
  xpBefore: number,
  xpAfter: number,
): Promise<number> {
  const paid = await grantCoinsDetailed(tx, userId, [chest, ...levelUpGrants(xpBefore, xpAfter)]);
  return paid.reduce((s, g) => s + g.amount, 0);
}

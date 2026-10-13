import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CoinGrant } from "@/lib/shop/coins";

export type { CoinGrant };

/**
 * Начисление монет в транзакции: запись журнала с `ON CONFLICT ("userId", key) DO NOTHING` — повтор того же
 * события (тот же ключ) монет не даёт. Баланс растёт на сумму реально вставленных. Суммы ≤ 0 пропускаются.
 * Возвращает начисленное.
 */
export async function grantCoins(tx: Prisma.TransactionClient, userId: string, grants: CoinGrant[]): Promise<number> {
  return (await grantCoinsDetailed(tx, userId, grants)).reduce((s, g) => s + g.amount, 0);
}

/** То же, но возвращает именно вставленные начисления (повторы по ключу отсеяны) — для сводки. */
export async function grantCoinsDetailed(tx: Prisma.TransactionClient, userId: string, grants: CoinGrant[]): Promise<CoinGrant[]> {
  const byKey = new Map<string, CoinGrant>();
  for (const g of grants) if (g.amount > 0 && !byKey.has(g.key)) byKey.set(g.key, g);
  const paid = [...byKey.values()];
  if (paid.length === 0) return [];
  const values = paid.map(
    (g) =>
      Prisma.sql`(gen_random_uuid()::text, ${userId}, ${g.amount}, ${g.reason}::"CoinReason", ${g.key}, ${g.meta === undefined ? null : JSON.stringify(g.meta)}::jsonb)`,
  );
  const rows = await tx.$queryRaw<{ key: string; amount: number }[]>`
    INSERT INTO "CoinTx" (id, "userId", amount, reason, key, meta)
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("userId", key) DO NOTHING
    RETURNING key, amount`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total > 0) await tx.user.update({ where: { id: userId }, data: { coins: { increment: total } } });
  return rows.map((r) => byKey.get(r.key)!);
}

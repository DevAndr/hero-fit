import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CoinReason } from "@/generated/prisma/enums";

export type CoinGrant = { reason: CoinReason; key: string; amount: number; meta?: Prisma.InputJsonValue };

/**
 * Начисление монет в транзакции: запись журнала с `ON CONFLICT ("userId", key) DO NOTHING` — повтор того же
 * события (тот же ключ) монет не даёт. Баланс растёт на сумму реально вставленных. Суммы ≤ 0 пропускаются.
 * Возвращает начисленное.
 */
export async function grantCoins(tx: Prisma.TransactionClient, userId: string, grants: CoinGrant[]): Promise<number> {
  const paid = grants.filter((g) => g.amount > 0);
  if (paid.length === 0) return 0;
  const values = paid.map(
    (g) =>
      Prisma.sql`(gen_random_uuid()::text, ${userId}, ${g.amount}, ${g.reason}::"CoinReason", ${g.key}, ${g.meta === undefined ? null : JSON.stringify(g.meta)}::jsonb)`,
  );
  const rows = await tx.$queryRaw<{ amount: number }[]>`
    INSERT INTO "CoinTx" (id, "userId", amount, reason, key, meta)
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("userId", key) DO NOTHING
    RETURNING amount`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total > 0) await tx.user.update({ where: { id: userId }, data: { coins: { increment: total } } });
  return total;
}

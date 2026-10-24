import "server-only";
import { dayKey } from "@/lib/daily-login";
import { addDays, weekStart } from "@/lib/dates";
import { db } from "@/lib/db";
import { coinWeeks, type CoinWeek, type CoinWeekRow } from "@/lib/shop/coin-stats";

export const COIN_WEEKS = 12;

export type CoinStats = { weeks: CoinWeek[]; balance: number };

/** Монеты по местным неделям (пн) за COIN_WEEKS недель и текущий баланс — для графика на /stats. */
export async function getCoinStats(userId: string, timeZone: string, now = new Date()): Promise<CoinStats> {
  const today = dayKey(now, timeZone);
  // С запасом в сутки: границы недель — в поясе пользователя, лишнее отсекает coinWeeks
  const since = new Date(`${addDays(weekStart(today), -7 * (COIN_WEEKS - 1) - 1)}T00:00:00Z`);
  const [rows, user] = await Promise.all([
    db.$queryRaw<CoinWeekRow[]>`
      SELECT to_char(date_trunc('week', (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}), 'YYYY-MM-DD') AS week,
             t.reason, SUM(t.amount)::int AS amount
      FROM "CoinTx" t
      WHERE t."userId" = ${userId} AND t."createdAt" >= ${since} AND t.amount > 0
      GROUP BY 1, 2
    `,
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { coins: true } }),
  ]);
  return { weeks: coinWeeks(rows, today, COIN_WEEKS), balance: user.coins };
}

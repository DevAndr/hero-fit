import "server-only";
import { db } from "@/lib/db";

const DAY = 86_400_000;

/** Сколько раз открывали контакты тренера за последние `days` дней (включая сегодня). */
export async function contactClicksForDays(coachId: string, days: number, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const r = await db.coachContactClick.aggregate({ where: { coachId, day: { gte: since } }, _sum: { count: true } });
  return r._sum.count ?? 0;
}

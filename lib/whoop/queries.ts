import "server-only";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { cardState, outsideHistory, type WhoopCardState } from "./card";
import { whoopConfigured } from "./config";
import { matchWhoop } from "./match";
import type { WhoopScoreState, WhoopWorkoutRow } from "./types";

export type WhoopStatus =
  | { connected: false }
  | { connected: true; since: Date; needsReauth: boolean; lastSyncAt: Date | null };

/** Интеграция доступна пользователю: WHOOP настроен на сервере и флаг `whoop` включён. */
export async function whoopAvailable(userId: string): Promise<boolean> {
  return whoopConfigured() && (await isEnabled("whoop", userId));
}

/** Статус подключения для /devices и строки в /settings (без токенов). */
export async function getWhoopStatus(userId: string): Promise<WhoopStatus> {
  const conn = await db.whoopConnection.findUnique({
    where: { userId },
    select: { createdAt: true, needsReauth: true, lastSyncAt: true },
  });
  if (!conn) return { connected: false };
  return { connected: true, since: conn.createdAt, needsReauth: conn.needsReauth, lastSyncAt: conn.lastSyncAt };
}

/**
 * Карточка WHOOP в сводке тренировки. `null` — тренировка не завершена, без времени, WHOOP не подключён
 * или тренировка старше загруженной истории и активностей рядом нет (`outsideHistory`).
 * Кандидаты — активности, пересекающиеся с тренировкой (`start < finishedAt && end > startedAt`).
 */
export async function getWhoopCard(
  userId: string,
  w: { startedAt: Date | null; finishedAt: Date | null; status: string },
): Promise<WhoopCardState | null> {
  if (w.status !== "COMPLETED" || !w.startedAt || !w.finishedAt) return null;
  const conn = await db.whoopConnection.findUnique({ where: { userId }, select: { needsReauth: true, createdAt: true } });
  if (!conn) return null;
  const rows = await db.whoopWorkout.findMany({
    where: { userId, start: { lt: w.finishedAt }, end: { gt: w.startedAt } },
    select: { id: true, start: true, end: true, sportName: true, scoreState: true, strain: true, avgHr: true, maxHr: true, kilojoule: true, zonesMs: true },
  });
  if (outsideHistory(w.finishedAt, conn.createdAt, rows.length)) return null;
  const candidates: WhoopWorkoutRow[] = rows.map((r) => ({ ...r, scoreState: r.scoreState as WhoopScoreState }));
  const match = matchWhoop({ startedAt: w.startedAt, finishedAt: w.finishedAt }, candidates);
  return cardState(match, w.finishedAt, new Date(), conn.needsReauth);
}

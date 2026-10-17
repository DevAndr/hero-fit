import "server-only";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { whoopConfigured } from "./config";

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

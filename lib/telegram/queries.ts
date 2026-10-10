import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { telegramEnabled } from "@/lib/telegram/format";

export type TelegramStatus = { enabled: false } | { enabled: true; linked: boolean; username: string | null; notify: boolean };

/** Статус для настроек — без chatId (BigInt не уходит в клиент). */
export async function getTelegramStatus(userId: string): Promise<TelegramStatus> {
  if (!telegramEnabled(env)) return { enabled: false };
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { telegramChatId: true, telegramUsername: true, notifyTelegram: true },
  });
  return { enabled: true, linked: u.telegramChatId !== null, username: u.telegramUsername, notify: u.notifyTelegram };
}

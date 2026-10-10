import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { callBot } from "@/lib/telegram/api";
import { telegramEnabled, telegramMessage } from "@/lib/telegram/format";
import { unlinkTelegram } from "@/lib/telegram/updates";

/**
 * Копия уведомления в Telegram. Привязка и переключатель читаются в момент отправки (отключил, пока запись
 * ждала в очереди, — не уйдёт). Таймер отдыха — только push. Бот заблокирован (403) — привязка снимается.
 */
export async function sendTelegramToUser(
  userId: string,
  p: { type: NotificationType; title: string; body: string; url: string | null },
): Promise<{ sent: boolean }> {
  if (!telegramEnabled(env) || p.type === "REST") return { sent: false };
  const user = await db.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, notifyTelegram: true } });
  if (!user?.telegramChatId || !user.notifyTelegram) return { sent: false };

  const chatId = user.telegramChatId;
  const result = await callBot("sendMessage", { chat_id: chatId.toString(), ...telegramMessage(p, env.APP_URL) });
  if (result.ok) return { sent: true };
  if (result.status === 403) await unlinkTelegram({ chatId });
  else console.error("[telegram] send failed", result.status, result.description);
  return { sent: false };
}

import "server-only";
import { db } from "@/lib/db";
import { callBot } from "@/lib/telegram/api";
import { escapeHtml, linkTokenStatus } from "@/lib/telegram/format";

const TEXT = {
  hello: "Привет! Это бот Hero Fit. Подключите уведомления в настройках приложения",
  badToken: "Ссылка устарела — нажмите «Подключить» в настройках ещё раз",
  stopped: "Уведомления отключены",
  help: "Я присылаю уведомления Hero Fit. Отключить — /stop",
  linked: (name: string) => `Готово, ${escapeHtml(name)}! Сюда будут приходить уведомления Hero Fit`,
};

const UNLINKED = { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null };

type LinkResult = { status: "ok"; name: string } | { status: "expired" | "used" | "missing" };

/** Привязка по одноразовому токену: условная отметка usedAt — из двух одновременных /start сработает один. */
export async function linkChat(token: string, chat: { id: number; username?: string }, now = new Date()): Promise<LinkResult> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.telegramLinkToken.updateMany({
      where: { token, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    const row = await tx.telegramLinkToken.findUnique({ where: { token }, select: { userId: true, expiresAt: true, usedAt: true } });
    if (count === 0 || !row) {
      const status = linkTokenStatus(row, now);
      return { status: status === "ok" ? "used" : status };
    }
    const chatId = BigInt(chat.id);
    // Один Telegram — один аккаунт: у прежнего владельца чата привязка снимается
    await tx.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: row.userId } }, data: UNLINKED });
    const user = await tx.user.update({
      where: { id: row.userId },
      // Подключение — явное желание получать уведомления: прежний «выключено» не переживает отвязку
      data: { telegramChatId: chatId, telegramUsername: chat.username ?? null, telegramLinkedAt: now, notifyTelegram: true },
      select: { nickname: true, login: true },
    });
    return { status: "ok", name: user.nickname ?? user.login };
  });
}

export async function unlinkTelegram(where: { userId: string } | { chatId: bigint }) {
  await db.user.updateMany({ where: "userId" in where ? { id: where.userId } : { telegramChatId: where.chatId }, data: UNLINKED });
}

type Message = { chat?: { id?: unknown; type?: unknown }; from?: { username?: unknown }; text?: unknown };

/** Обновление от Telegram (webhook или getUpdates): только текст в личном чате, остальное игнорируется. */
export async function handleUpdate(update: unknown): Promise<void> {
  const message = (update as { message?: Message } | null)?.message;
  const chatId = message?.chat?.id;
  if (!message || message.chat?.type !== "private" || typeof chatId !== "number" || typeof message.text !== "string") return;

  const reply = (text: string) => callBot("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  const [command, arg] = message.text.trim().split(/\s+/, 2);

  if (command === "/start") {
    if (!arg) return void (await reply(TEXT.hello));
    const username = typeof message.from?.username === "string" ? message.from.username : undefined;
    const result = await linkChat(arg, { id: chatId, username });
    return void (await reply(result.status === "ok" ? TEXT.linked(result.name) : TEXT.badToken));
  }
  if (command === "/stop") {
    await unlinkTelegram({ chatId: BigInt(chatId) });
    return void (await reply(TEXT.stopped));
  }
  await reply(TEXT.help);
}

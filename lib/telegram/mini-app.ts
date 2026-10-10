import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { TelegramUser } from "@/lib/telegram/init-data";

const telegramName = (u: TelegramUser) => [u.firstName, u.lastName].filter(Boolean).join(" ").slice(0, 80);

/** Аккаунт, к которому привязан этот Telegram (бот или Mini App). В личном чате chat id = id пользователя. */
export async function findByTelegram(telegramId: number) {
  return db.user.findUnique({ where: { telegramChatId: BigInt(telegramId) }, select: { id: true } });
}

/**
 * Аккаунт из Telegram без email и пароля. Двойное «Начать» (две параллельные регистрации): уникальные login
 * и telegramChatId не дадут второй строки — возвращаем уже созданную.
 */
export async function registerFromTelegram(user: TelegramUser, now = new Date()): Promise<string> {
  try {
    const created = await db.user.create({
      data: {
        login: `tg${user.id}`,
        name: telegramName(user) || null,
        telegramChatId: BigInt(user.id),
        telegramUsername: user.username ?? null,
        telegramLinkedAt: now,
        notifyTelegram: true,
        privacyAcceptedAt: now,
        onboardedAt: env.ONBOARDING_TOUR === "off" ? now : null,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await findByTelegram(user.id);
      if (existing) return existing.id;
    }
    throw e;
  }
}

/** Привязать Telegram к существующему аккаунту: у прежнего владельца этого Telegram привязка снимается. */
export async function linkTelegramTo(userId: string, user: TelegramUser, now = new Date()) {
  const chatId = BigInt(user.id);
  await db.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { telegramChatId: chatId, NOT: { id: userId } },
      data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: { telegramChatId: chatId, telegramUsername: user.username ?? null, telegramLinkedAt: now, notifyTelegram: true },
    });
  });
}

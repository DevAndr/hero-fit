import "server-only";
import { randomInt } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { TelegramUser } from "@/lib/telegram/init-data";
import { RELEASES } from "@/lib/changelog/releases";
import { latestReleaseId } from "@/lib/changelog/view";

/**
 * Вход в Mini App — по User.telegramId; уведомления — по telegramChatId (в личном чате это то же число).
 * Поля разделены: /stop, «Отключить» и заблокированный бот снимают только уведомления, а ссылку бота может
 * подсунуть кто угодно — она не даёт входа.
 */

const telegramName = (u: TelegramUser) => [u.firstName, u.lastName].filter(Boolean).join(" ").slice(0, 80);

export async function findByTelegram(telegramId: number) {
  return db.user.findUnique({ where: { telegramId: BigInt(telegramId) }, select: { id: true } });
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Аккаунт из Telegram без email и пароля. Двойное «Начать»: уникальный telegramId не даст второй строки —
 * возвращаем созданную. Логин tg<id> мог быть занят (старая регистрация на сайте) — тогда tg<id>_<4 цифры>.
 */
export async function registerFromTelegram(user: TelegramUser, now = new Date()): Promise<string> {
  const id = BigInt(user.id);
  const data = (login: string) => ({
    login,
    name: telegramName(user) || null,
    telegramId: id,
    telegramChatId: id,
    telegramUsername: user.username ?? null,
    telegramLinkedAt: now,
    changelogSeen: latestReleaseId(RELEASES),
    notifyTelegram: true,
    privacyAcceptedAt: now,
    onboardedAt: env.ONBOARDING_TOUR === "off" ? now : null,
  });

  for (const login of [`tg${user.id}`, `tg${user.id}_${randomInt(1000, 10000)}`, `tg${user.id}_${randomInt(1000, 10000)}`]) {
    try {
      return await db.$transaction(async (tx) => {
        // Уведомления этого чата могли идти на аккаунт, подключивший бота, — теперь их получает новый
        await tx.user.updateMany({ where: { telegramChatId: id }, data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null } });
        const created = await tx.user.create({ data: data(login), select: { id: true } });
        return created.id;
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const existing = await findByTelegram(user.id);
      if (existing) return existing.id;
      // занят логин — следующий вариант
    }
  }
  throw new Error("telegram registration: no free login");
}

export type LinkResult = { ok: true } | { ok: false; reason: "telegram_in_use" };

/**
 * Привязать Telegram к аккаунту, в который вошли паролем. Если этот Telegram — единственный вход в другой аккаунт
 * (без пароля), отказ: иначе тот аккаунт потерялся бы навсегда.
 */
export async function linkTelegramTo(userId: string, user: TelegramUser, now = new Date()): Promise<LinkResult> {
  const id = BigInt(user.id);
  return db.$transaction(async (tx) => {
    const holder = await tx.user.findUnique({ where: { telegramId: id }, select: { id: true, passwordHash: true } });
    if (holder && holder.id !== userId && !holder.passwordHash) return { ok: false, reason: "telegram_in_use" } as const;
    await tx.user.updateMany({ where: { telegramId: id, NOT: { id: userId } }, data: { telegramId: null } });
    await tx.user.updateMany({
      where: { telegramChatId: id, NOT: { id: userId } },
      data: { telegramChatId: null, telegramUsername: null, telegramLinkedAt: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: { telegramId: id, telegramChatId: id, telegramUsername: user.username ?? null, telegramLinkedAt: now, notifyTelegram: true },
    });
    return { ok: true } as const;
  });
}

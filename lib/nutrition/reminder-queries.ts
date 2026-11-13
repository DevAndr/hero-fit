import "server-only";
import type { Meal } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { pushEnabled } from "@/lib/notifications/push";
import { telegramEnabled } from "@/lib/telegram/format";

export type MealReminderView = { id: string; meal: Meal; minutes: number; enabled: boolean };

/**
 * Напоминания пользователя по возрастанию времени. `canPush` — есть куда слать сам push: подписка (браузер или
 * Android-приложение через ntfy — те же строки PushSubscription, при настроенных VAPID-ключах) либо Telegram
 * (бот настроен, чат привязан, копии не отключены — те же условия, что в sendTelegramToUser).
 */
export async function getMealReminders(userId: string): Promise<{ reminders: MealReminderView[]; canPush: boolean }> {
  const [reminders, user, subscriptions] = await Promise.all([
    db.mealReminder.findMany({ where: { userId }, orderBy: { minutes: "asc" }, select: { id: true, meal: true, minutes: true, enabled: true } }),
    db.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, notifyTelegram: true } }),
    db.pushSubscription.count({ where: { userId } }),
  ]);
  const web = pushEnabled() && subscriptions > 0;
  const telegram = telegramEnabled(env) && user?.telegramChatId != null && user.notifyTelegram;
  return { reminders, canPush: web || telegram };
}

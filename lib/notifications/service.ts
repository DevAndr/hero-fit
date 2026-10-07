import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/notifications/push";
import { shouldRemindStreak } from "@/lib/notifications/reminders";

type Client = Prisma.TransactionClient;

type Message = { type: NotificationType; title: string; body: string; url?: string };

/**
 * Уведомление в ленту приложения и (опционально) в очередь push. Можно вызывать внутри транзакции:
 * push уйдёт фоновой задачей уже после коммита.
 */
export async function notify(client: Client, userId: string, message: Message, { push }: { push: boolean }) {
  await client.notification.create({ data: { userId, ...message } });
  if (push) await client.scheduledPush.create({ data: { userId, ...message, sendAt: new Date() } });
}

/** Пачка уведомлений одному пользователю — два INSERT вместо двух на каждое (важно внутри транзакции). */
export async function notifyMany(client: Client, userId: string, messages: Message[], { push }: { push: boolean }) {
  if (messages.length === 0) return;
  await client.notification.createMany({ data: messages.map((m) => ({ userId, ...m })) });
  if (push) {
    const sendAt = new Date();
    await client.scheduledPush.createMany({ data: messages.map((m) => ({ userId, ...m, sendAt })) });
  }
}

// ───────────────────────────── Таймер отдыха ─────────────────────────────

const restKey = (userId: string) => `rest:${userId}`;

/** Один отложенный push на пользователя: +15 сек / новый подход просто переносят его. */
export async function scheduleRestPush(userId: string, endsAt: Date, nextLabel: string) {
  const data = {
    userId,
    type: NotificationType.REST,
    title: "Отдых окончен 💪",
    body: `Следующий подход: ${nextLabel}`,
    url: "/training",
    sendAt: endsAt,
    sentAt: null,
    cancelledAt: null,
  };
  await db.scheduledPush.upsert({ where: { key: restKey(userId) }, create: { key: restKey(userId), ...data }, update: data });
}

export async function cancelRestPush(userId: string) {
  await db.scheduledPush.updateMany({
    where: { key: restKey(userId), sentAt: null, cancelledAt: null },
    data: { cancelledAt: new Date() },
  });
}

// ───────────────────────────── Фоновая обработка ─────────────────────────────

/** Отправить всё, у чего наступил sendAt. SKIP LOCKED — несколько воркеров не отправят дважды. */
export async function processDuePushes(now = new Date()) {
  const due = await db.$queryRaw<{ id: string; userId: string; type: NotificationType; title: string; body: string; url: string | null }[]>`
    UPDATE "ScheduledPush" SET "sentAt" = ${now}
    WHERE id IN (
      SELECT id FROM "ScheduledPush"
      WHERE "sentAt" IS NULL AND "cancelledAt" IS NULL AND "sendAt" <= ${now}
      ORDER BY "sendAt"
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "userId", type::text AS type, title, body, url
  `;
  // Параллельно: медленный push-сервис одного пользователя не задерживает остальных.
  await Promise.allSettled(due.map((p) => sendPushToUser(p.userId, p)));
  return due.length;
}

/** «Не потеряй streak! Осталось N ч» — одно напоминание на окно серии. */
export async function processStreakReminders(now = new Date()) {
  const H = 3_600_000;
  const candidates = await db.user.findMany({
    where: {
      notifyStreak: true,
      currentStreak: { gt: 0 },
      // окно 24–48 ч с последней засчитанной тренировки, из него — последние 3 часа
      lastStreakAt: { gt: new Date(now.getTime() - 48 * H), lte: new Date(now.getTime() - 45 * H) },
    },
    select: { id: true, currentStreak: true, lastStreakAt: true, streakFreezes: true, streakReminderFor: true },
  });

  let sent = 0;
  for (const user of candidates) {
    const reminder = shouldRemindStreak(user, now);
    if (!reminder) continue;
    await db.$transaction(async (tx) => {
      // Условие по старому значению — параллельный воркер не напомнит второй раз.
      const { count } = await tx.user.updateMany({
        where: { id: user.id, streakReminderFor: user.streakReminderFor },
        data: { streakReminderFor: user.lastStreakAt },
      });
      if (count === 0) return;
      await notify(
        tx,
        user.id,
        {
          type: NotificationType.STREAK,
          title: "Не потеряй streak! 🔥",
          body: `Серия ${user.currentStreak} — осталось ${reminder.hoursLeft} ч, чтобы её продлить.`,
          url: "/training",
        },
        { push: true },
      );
      sent++;
    });
  }
  // Свежие напоминания созданы «сейчас», позже начала тика — отправляем с актуальным временем.
  if (sent) await processDuePushes();
  return sent;
}

export async function runNotificationTick() {
  const reminders = await processStreakReminders();
  const pushes = await processDuePushes();
  return { reminders, pushes };
}

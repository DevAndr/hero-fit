import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/notifications/push";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { shouldRemindStreak, streakReminderBody } from "@/lib/notifications/reminders";
import { STREAK_REMINDER_HOUR } from "@/lib/progress/weekly-streak";

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

/** «Не потеряй streak!» — неделю ещё можно засчитать, но тренировок не хватает на оставшиеся дни. Раз в день. */
export async function processStreakReminders(now = new Date()) {
  // Грубый отбор в SQL по местному времени (пт–вс, после полудня, сегодня ещё не напоминали), точный — shouldRemindStreak.
  const candidates = await db.$queryRaw<
    {
      id: string;
      timeZone: string;
      currentStreak: number;
      lastStreakWeek: string | null;
      streakFreezes: number;
      weekWorkouts: number;
      weekWorkoutsKey: string | null;
      streakReminderDay: string | null;
    }[]
  >`
    SELECT id, "timeZone", "currentStreak", "lastStreakWeek", "streakFreezes", "weekWorkouts", "weekWorkoutsKey", "streakReminderDay"
    FROM "User"
    WHERE "notifyStreak" AND "currentStreak" > 0 AND "lastStreakWeek" IS NOT NULL
      AND extract(isodow FROM ${now}::timestamptz AT TIME ZONE "timeZone") >= 5
      AND extract(hour FROM ${now}::timestamptz AT TIME ZONE "timeZone") >= ${STREAK_REMINDER_HOUR}
      AND "streakReminderDay" IS DISTINCT FROM to_char(${now}::timestamptz AT TIME ZONE "timeZone", 'YYYY-MM-DD')
  `;

  let sent = 0;
  for (const user of candidates) {
    const tz = safeTimeZone(user.timeZone);
    const reminder = shouldRemindStreak(user, now, tz);
    if (!reminder) continue;
    await db.$transaction(async (tx) => {
      // Условие по старому значению — параллельный воркер не напомнит второй раз.
      const { count } = await tx.user.updateMany({
        where: { id: user.id, streakReminderDay: user.streakReminderDay },
        data: { streakReminderDay: dayKey(now, tz) },
      });
      if (count === 0) return;
      await notify(
        tx,
        user.id,
        { type: NotificationType.STREAK, title: "Не потеряй streak! 🔥", body: streakReminderBody(reminder), url: "/training" },
        { push: true },
      );
      sent++;
    });
  }
  // Свежие напоминания созданы «сейчас», позже начала тика — отправляем с актуальным временем.
  if (sent) await processDuePushes();
  return sent;
}

/** now — только для тестовых часов (E2E_TEST_CLOCK): влияет на выбор напоминаний, не на очередь push. */
export async function runNotificationTick(now = new Date()) {
  const reminders = await processStreakReminders(now);
  const pushes = await processDuePushes();
  return { reminders, pushes };
}

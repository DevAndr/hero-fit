import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/notifications/push";
import { sendTelegramToUser } from "@/lib/telegram/send";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { shouldRemindStreak, streakReminderBody } from "@/lib/notifications/reminders";
import { addDays } from "@/lib/plans/expand";
import { getCalendar } from "@/lib/plans/queries";
import { duePlanReminders, planReminderText } from "@/lib/plans/reminders";
import { STREAK_REMINDER_HOUR } from "@/lib/progress/weekly-streak";
import { processWeeklyRecaps } from "@/lib/recap/tick";

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
  // Параллельно: медленный push-сервис одного пользователя не задерживает остальных. Telegram — второй канал.
  await Promise.allSettled(due.flatMap((p) => [sendPushToUser(p.userId, p), sendTelegramToUser(p.userId, p)]));
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
      freezeGrantedAt: Date | null;
      streakReminderDay: string | null;
    }[]
  >`
    SELECT id, "timeZone", "currentStreak", "lastStreakWeek", "streakFreezes", "weekWorkouts", "weekWorkoutsKey", "freezeGrantedAt", "streakReminderDay"
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

/**
 * «Сегодня по плану» за planReminderMin минут до начала. Кандидаты — одним SQL по окну начала (окно может перейти
 * через полночь — смотрим и завтра); точный выбор с исключениями и статусами — duePlanReminders.
 */
export async function processPlanReminders(now = new Date()) {
  // Только те, у кого начало плана попадает в окно (сейчас, сейчас + planReminderMin] по местному времени:
  // серии — на сегодня/завтра по дню недели, записи (разовые и перенесённые) — по своей дате.
  const candidates = await db.$queryRaw<{ id: string; timeZone: string; planReminderMin: number }[]>`
    WITH u AS (
      SELECT id, "timeZone", "planReminderMin",
             (${now}::timestamptz AT TIME ZONE "timeZone") AS l,
             (${now}::timestamptz AT TIME ZONE "timeZone") + make_interval(mins => "planReminderMin") AS l_end
      FROM "User" WHERE "notifyPlan"
    )
    SELECT u.id, u."timeZone", u."planReminderMin" FROM u
    WHERE EXISTS (
      SELECT 1 FROM "PlanSeries" s, (VALUES (0), (1)) AS d(shift)
      WHERE s."userId" = u.id
        AND s.weekday = extract(isodow FROM u.l::date + d.shift)::int - 1
        AND s."startDate" <= to_char(u.l::date + d.shift, 'YYYY-MM-DD')
        AND (s."endDate" IS NULL OR s."endDate" >= to_char(u.l::date + d.shift, 'YYYY-MM-DD'))
        AND (u.l::date + d.shift + s.time::time) > u.l
        AND (u.l::date + d.shift + s.time::time) <= u.l_end
    ) OR EXISTS (
      SELECT 1 FROM "PlanEntry" e
      WHERE e."userId" = u.id AND NOT e.cancelled
        AND (e.date::date + e.time::time) > u.l
        AND (e.date::date + e.time::time) <= u.l_end
    )
  `;

  let sent = 0;
  for (const user of candidates) {
    const tz = safeTimeZone(user.timeZone);
    const today = dayKey(now, tz);
    const calendar = await getCalendar(user.id, today, addDays(today, 1), tz, now);
    const sentKeys = new Set(
      (await db.planReminder.findMany({ where: { userId: user.id }, select: { planKey: true } })).map((r) => r.planKey),
    );
    const due = duePlanReminders(calendar.occurrences, {
      now,
      tz,
      leadMin: user.planReminderMin,
      sentKeys,
      doneKeys: new Set(calendar.occurrences.filter((o) => o.status === "done").map((o) => o.key)),
      hasActiveWorkout: calendar.hasActiveWorkout,
    });
    for (const o of due) {
      const exercises = o.templateId ? (calendar.templates[o.templateId]?.exercises ?? null) : null;
      await db.$transaction(async (tx) => {
        // Уникальная строка — параллельный воркер не напомнит второй раз
        const created = await tx.planReminder.createMany({ data: [{ userId: user.id, planKey: o.key }], skipDuplicates: true });
        if (created.count === 0) return;
        await notify(
          tx,
          user.id,
          { type: NotificationType.PLAN, ...planReminderText(o, exercises, today), url: `/calendar?date=${o.date}` },
          { push: true },
        );
        sent++;
      });
    }
  }
  if (sent) await processDuePushes();
  return sent;
}

/** now — только для тестовых часов (E2E_TEST_CLOCK): влияет на выбор напоминаний, не на очередь push. */
export async function runNotificationTick(now = new Date()) {
  // Сначала срочное (таймер отдыха и уже готовые push), итоги недели — после: их генерация не задерживает доставку
  let pushes = await processDuePushes();
  let reminders = (await processStreakReminders(now)) + (await processPlanReminders(now));
  try {
    const recaps = await processWeeklyRecaps(now);
    reminders += recaps;
    if (recaps) pushes += await processDuePushes();
  } catch (e) {
    console.error("[recap] шаг итогов недели упал", e);
  }
  return { reminders, pushes };
}

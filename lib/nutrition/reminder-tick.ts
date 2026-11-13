import "server-only";
import { NotificationType } from "@/generated/prisma/enums";
import type { Meal } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { isEnabled } from "@/lib/flags/server";
import { notify } from "@/lib/notifications/service";
import { MEAL_REMIND_WINDOW_MIN, mealReminderDue, mealReminderText } from "@/lib/nutrition/reminders";

const BUDGET_MS = 1_000;

/**
 * Напоминания о приёмах пищи: время наступило не более часа назад по местному времени, сегодня ещё не решали.
 * Решение принимается раз в день (`remindedDay`): день ставится и когда уведомление ушло, и когда приём уже записан,
 * и когда у пользователя не включён флаг `nutrition` (уведомления нет, но строка больше не занимает выборку).
 * Отбор — в SQL по местным минутам и дню (уже решённые сегодня в выборку не попадают, поэтому `LIMIT 500` не
 * застревает на одних и тех же строках, порядок — `minutes, id`); точная проверка — `mealReminderDue`.
 * Пояс в SQL не перепроверяется (как у streak): пояс, которого не знает Postgres, остановит шаг.
 * Записи дневника — одним запросом на всех кандидатов.
 */
export async function processMealReminders(now: Date): Promise<number> {
  const started = Date.now();
  const rows = await db.$queryRaw<{ id: string; userId: string; meal: Meal; minutes: number; remindedDay: string | null; timeZone: string }[]>`
    WITH r AS (
      SELECT m.id, m."userId", m.meal, m.minutes, m."remindedDay", u."timeZone",
             (${now}::timestamptz AT TIME ZONE u."timeZone") AS l
      FROM "MealReminder" m JOIN "User" u ON u.id = m."userId"
      WHERE m.enabled
    )
    SELECT id, "userId", meal, minutes, "remindedDay", "timeZone" FROM r
    WHERE "remindedDay" IS DISTINCT FROM to_char(l, 'YYYY-MM-DD')
      AND (extract(hour FROM l) * 60 + extract(minute FROM l))::int - minutes >= 0
      AND (extract(hour FROM l) * 60 + extract(minute FROM l))::int - minutes < ${MEAL_REMIND_WINDOW_MIN}
    ORDER BY minutes, id
    LIMIT 500
  `;
  const due = rows.flatMap((r) => {
    const d = mealReminderDue({ now, timeZone: safeTimeZone(r.timeZone), minutes: r.minutes, enabled: true, remindedDay: r.remindedDay });
    return d ? [{ ...r, day: d.day }] : [];
  });
  if (due.length === 0) return 0;

  const entries = await db.foodEntry.findMany({
    where: { userId: { in: [...new Set(due.map((r) => r.userId))] }, date: { in: [...new Set(due.map((r) => r.day))] } },
    select: { userId: true, date: true, meal: true },
  });
  const logged = new Set(entries.map((e) => `${e.userId}|${e.date}|${e.meal}`));

  let sent = 0;
  for (const r of due) {
    if (Date.now() - started > BUDGET_MS) break;
    const allowed = await isEnabled("nutrition", r.userId);
    const already = logged.has(`${r.userId}|${r.day}|${r.meal}`);
    sent += await db.$transaction(async (tx) => {
      // Условие по remindedDay — защита от параллельного тика
      const { count } = await tx.mealReminder.updateMany({
        where: { id: r.id, enabled: true, minutes: r.minutes, OR: [{ remindedDay: null }, { remindedDay: { not: r.day } }] },
        data: { remindedDay: r.day },
      });
      if (count !== 1 || already || !allowed) return 0;
      await notify(
        tx,
        r.userId,
        { type: NotificationType.MEAL_REMINDER, ...mealReminderText(r.meal, r.minutes), url: "/nutrition" },
        { push: true },
      );
      return 1;
    });
  }
  return sent;
}

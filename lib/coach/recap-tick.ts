import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { isCoachRecapTotals, recapPushBody } from "@/lib/coach/recap";
import { createCoachRecap } from "@/lib/coach/recap-queries";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { recapWeekFor, shouldPushRecap } from "@/lib/recap/schedule";
import { RECAP_HOUR } from "@/lib/recap/types";

/** Тик общий с таймером отдыха: за один тик — не дольше, остальных тренеров доберут следующие. */
const TICK_BUDGET_MS = 2000;

/**
 * Тренеры, у которых по местному времени понедельник ≥ RECAP_HOUR:00; cur — начало текущей недели (местное),
 * last_week — ключ прошлой недели. Все сравнения — от переданного now (тестовые часы), не от now() Postgres.
 */
const mondayCoaches = (now: Date) => Prisma.sql`
  SELECT id, "timeZone", "notifyCoachRecap", "createdAt",
         date_trunc('week', ${now}::timestamptz AT TIME ZONE "timeZone") AS cur,
         to_char(date_trunc('week', ${now}::timestamptz AT TIME ZONE "timeZone") - interval '7 days', 'YYYY-MM-DD') AS last_week
  FROM "User"
  WHERE "isCoach"
    AND extract(isodow FROM ${now}::timestamptz AT TIME ZONE "timeZone") = 1
    AND extract(hour FROM ${now}::timestamptz AT TIME ZONE "timeZone") >= ${RECAP_HOUR}
`;

/**
 * Снимки прошлой недели. Клиент снимка — активная связь, созданная до конца прошлой недели; конец прошлой недели —
 * это начало текущей (cur) в поясе тренера, то же условие, что в createCoachRecap. Поэтому тренер, у которого
 * все связи новее, сюда не попадает — и не перебирается каждый тик впустую.
 */
async function createDueRecaps(now: Date) {
  const due = await db.$queryRaw<{ id: string; timeZone: string }[]>`
    WITH m AS (${mondayCoaches(now)})
    SELECT m.id, m."timeZone" FROM m
    WHERE EXISTS (
        SELECT 1 FROM "CoachLink" l
        WHERE l."coachId" = m.id AND l."endedAt" IS NULL
          AND l."createdAt" < (m.cur AT TIME ZONE m."timeZone") AT TIME ZONE 'UTC'
      )
      AND NOT EXISTS (SELECT 1 FROM "CoachWeeklyRecap" r WHERE r."coachId" = m.id AND r.week = m.last_week)
    ORDER BY m."createdAt" DESC
  `;
  const deadline = Date.now() + TICK_BUDGET_MS;
  for (const coach of due) {
    if (Date.now() > deadline) break;
    const tz = safeTimeZone(coach.timeZone);
    try {
      await createCoachRecap(coach.id, recapWeekFor(now, tz), tz, now);
    } catch (e) {
      console.error("[coach-recap] не удалось создать итоги", coach.id, e);
    }
  }
}

async function pushRecaps(now: Date) {
  const due = await db.$queryRaw<{ id: string; coachId: string; week: string; data: unknown; timeZone: string }[]>`
    WITH m AS (${mondayCoaches(now)})
    SELECT r.id, r."coachId", r.week, r.data, m."timeZone"
    FROM "CoachWeeklyRecap" r JOIN m ON m.id = r."coachId"
    WHERE m."notifyCoachRecap" AND r.week = m.last_week AND r."pushedAt" IS NULL AND r."seenAt" IS NULL
  `;
  let sent = 0;
  for (const recap of due) {
    if (!isCoachRecapTotals(recap.data)) continue;
    if (!shouldPushRecap({ week: recap.week, pushedAt: null, seenAt: null }, now, safeTimeZone(recap.timeZone))) continue;
    const totals = recap.data;
    try {
      await db.$transaction(async (tx) => {
        // Условие по pushedAt — параллельный тик не отправит второй раз; просмотренные до отправки — без push
        const { count } = await tx.coachWeeklyRecap.updateMany({ where: { id: recap.id, pushedAt: null, seenAt: null }, data: { pushedAt: now } });
        if (count === 0) return;
        await notify(
          tx,
          recap.coachId,
          { type: NotificationType.COACH, title: "Итоги недели клиентов 📋", body: recapPushBody(totals), url: `/coach/recap/${recap.week}` },
          { push: true },
        );
        sent++;
      });
    } catch (e) {
      console.error("[coach-recap] не удалось отправить итоги", recap.coachId, e);
    }
  }
  return sent;
}

/** Итоги недели тренерам в тике уведомлений: снимки прошлой недели и push. Возвращает число уведомлений. */
export async function processCoachRecaps(now = new Date()): Promise<number> {
  await createDueRecaps(now);
  return pushRecaps(now);
}

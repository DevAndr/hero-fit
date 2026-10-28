import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { recapPushBody } from "./build";
import { createRecap } from "./queries";
import { recapWeekFor, shouldPushRecap } from "./schedule";
import { RECAP_BATCH, RECAP_HOUR, type RecapData } from "./types";
import { isEnabled } from "@/lib/flags/server";

/**
 * Пользователи, у которых по местному времени понедельник ≥ RECAP_HOUR:00; cur — начало текущей недели (местное),
 * last_week — ключ прошлой недели. Все сравнения — от переданного now (тестовые часы), не от now() Postgres.
 */
const mondayUsers = (now: Date) => Prisma.sql`
  SELECT id, "timeZone", "notifyRecap", "recapNudgeWeek",
         date_trunc('week', ${now}::timestamptz AT TIME ZONE "timeZone") AS cur,
         to_char(date_trunc('week', ${now}::timestamptz AT TIME ZONE "timeZone") - interval '7 days', 'YYYY-MM-DD') AS last_week
  FROM "User"
  WHERE extract(isodow FROM ${now}::timestamptz AT TIME ZONE "timeZone") = 1
    AND extract(hour FROM ${now}::timestamptz AT TIME ZONE "timeZone") >= ${RECAP_HOUR}
`;

/** Есть завершённая тренировка в неделе [cur − from недель, cur − to недель) по местному времени пользователя. */
const hasWorkouts = (fromWeeks: number, toWeeks: number) => Prisma.sql`
  EXISTS (
    SELECT 1 FROM "Workout" w
    WHERE w."userId" = m.id AND w.status = 'COMPLETED' AND NOT w."stretchOnly"
      AND w."finishedAt" >= ((m.cur - make_interval(weeks => ${fromWeeks})) AT TIME ZONE m."timeZone") AT TIME ZONE 'UTC'
      AND w."finishedAt" < ((m.cur - make_interval(weeks => ${toWeeks})) AT TIME ZONE m."timeZone") AT TIME ZONE 'UTC'
  )
`;

async function createDueRecaps(now: Date) {
  const due = await db.$queryRaw<{ id: string; timeZone: string }[]>`
    WITH m AS (${mondayUsers(now)})
    SELECT m.id, m."timeZone" FROM m
    WHERE ${hasWorkouts(1, 0)}
      AND NOT EXISTS (SELECT 1 FROM "WeeklyRecap" r WHERE r."userId" = m.id AND r.week = m.last_week)
    LIMIT ${RECAP_BATCH}
  `;
  for (const user of due) {
    const tz = safeTimeZone(user.timeZone);
    try {
      await createRecap(user.id, recapWeekFor(now, tz), tz);
    } catch (e) {
      console.error("[recap] не удалось создать итоги", user.id, e);
    }
  }
}

async function pushRecaps(now: Date) {
  const due = await db.$queryRaw<{ id: string; userId: string; week: string; data: RecapData; timeZone: string }[]>`
    WITH m AS (${mondayUsers(now)})
    SELECT r.id, r."userId", r.week, r.data, m."timeZone"
    FROM "WeeklyRecap" r JOIN m ON m.id = r."userId"
    WHERE m."notifyRecap" AND r.week = m.last_week AND r."pushedAt" IS NULL AND r."seenAt" IS NULL
  `;
  let sent = 0;
  for (const recap of due) {
    if (!shouldPushRecap({ week: recap.week, pushedAt: null, seenAt: null }, now, safeTimeZone(recap.timeZone))) continue;
    // Флаг strength_analytics выключен после сборки снимка — push без «Ты стал сильнее»
    const data = (await isEnabled("strength_analytics", recap.userId)) ? recap.data : { ...recap.data, strength: undefined };
    await db.$transaction(async (tx) => {
      // Условие по pushedAt — параллельный тик не отправит второй раз; просмотренные до отправки — без push.
      const { count } = await tx.weeklyRecap.updateMany({ where: { id: recap.id, pushedAt: null, seenAt: null }, data: { pushedAt: now } });
      if (count === 0) return;
      await notify(
        tx,
        recap.userId,
        { type: NotificationType.RECAP, title: "Итоги недели 📊", body: recapPushBody(data), url: `/recap/${recap.week}` },
        { push: true },
      );
      sent++;
    });
  }
  return sent;
}

/** «Новый старт»: прошлая неделя пустая после активной — один раз (recapNudgeWeek). */
async function nudgeFreshStart(now: Date) {
  const due = await db.$queryRaw<{ id: string; recapNudgeWeek: string | null; last_week: string }[]>`
    WITH m AS (${mondayUsers(now)})
    SELECT m.id, m."recapNudgeWeek", m.last_week FROM m
    WHERE m."notifyRecap" AND m."recapNudgeWeek" IS DISTINCT FROM m.last_week
      AND NOT ${hasWorkouts(1, 0)} AND ${hasWorkouts(2, 1)}
  `;
  let sent = 0;
  for (const user of due) {
    await db.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: user.id, recapNudgeWeek: user.recapNudgeWeek },
        data: { recapNudgeWeek: user.last_week },
      });
      if (count === 0) return;
      await notify(
        tx,
        user.id,
        {
          type: NotificationType.RECAP,
          title: "Новая неделя — новый старт 💪",
          body: "Начни неделю с тренировки — до streak осталось 3",
          url: "/training",
        },
        { push: true },
      );
      sent++;
    });
  }
  return sent;
}

/** Итоги недели в тике уведомлений: создать снимки, отправить push, «новый старт». Возвращает число уведомлений. */
export async function processWeeklyRecaps(now = new Date()): Promise<number> {
  await createDueRecaps(now);
  return (await pushRecaps(now)) + (await nudgeFreshStart(now));
}

import "server-only";
import { dayKey } from "@/lib/daily-login";
import { addDays, weekStart } from "@/lib/dates";
import { db } from "@/lib/db";
import { getCalendar } from "@/lib/plans/queries";
import { getActivity } from "@/lib/stats/queries";
import { weekCompare, weekStrip, type StripDay, type WeekCompareView, type WeekTotals } from "./v3";

/** Дашборд v3: запросы полосы недели, «Недели в цифрах» и календаря активности. */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Эта неделя (пн 00:00 местн. … сейчас) и тот же отрезок прошлой. Рекорды — как в статистике: события опыта
 * PERSONAL_RECORD (первый результат в упражнении рекордом не считается). prev = null — до этой недели тренировок не было.
 */
export async function getWeekTotals(userId: string, tz: string, now = new Date()): Promise<{ cur: WeekTotals; prev: WeekTotals | null }> {
  const monday = weekStart(dayKey(now, tz));
  const prevMonday = addDays(monday, -7);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  // С запасом в сутки: границы — местные дни, лишнее отсекает фильтр по day
  const since = new Date(Date.parse(`${prevMonday}T00:00:00Z`) - DAY_MS);
  const [row] = await db.$queryRaw<
    { cv: number; cs: number; cn: number; cr: number; pv: number; ps: number; pn: number; pr: number; before: boolean }[]
  >`
    WITH w AS (
      SELECT w."totalVolume" AS volume, COALESCE(w."durationSec", 0) AS sec, w."totalSets" AS sets, w."finishedAt" AS at,
             ((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date AS day,
             COALESCE((
               SELECT SUM(jsonb_array_length(x.meta->'records'))
               FROM "XpEvent" x WHERE x."workoutId" = w.id AND x.reason = 'PERSONAL_RECORD'
             ), 0) AS prs
      FROM "Workout" w
      WHERE w."userId" = ${userId} AND w.status = 'COMPLETED' AND w."finishedAt" >= ${since}
    )
    SELECT
      COALESCE(SUM(volume) FILTER (WHERE day >= ${monday}::date AND at <= ${now}), 0)::float8 AS cv,
      COALESCE(SUM(sec) FILTER (WHERE day >= ${monday}::date AND at <= ${now}), 0)::int AS cs,
      COALESCE(SUM(sets) FILTER (WHERE day >= ${monday}::date AND at <= ${now}), 0)::int AS cn,
      COALESCE(SUM(prs) FILTER (WHERE day >= ${monday}::date AND at <= ${now}), 0)::int AS cr,
      COALESCE(SUM(volume) FILTER (WHERE day >= ${prevMonday}::date AND day < ${monday}::date AND at <= ${weekAgo}), 0)::float8 AS pv,
      COALESCE(SUM(sec) FILTER (WHERE day >= ${prevMonday}::date AND day < ${monday}::date AND at <= ${weekAgo}), 0)::int AS ps,
      COALESCE(SUM(sets) FILTER (WHERE day >= ${prevMonday}::date AND day < ${monday}::date AND at <= ${weekAgo}), 0)::int AS pn,
      COALESCE(SUM(prs) FILTER (WHERE day >= ${prevMonday}::date AND day < ${monday}::date AND at <= ${weekAgo}), 0)::int AS pr,
      EXISTS (
        SELECT 1 FROM "Workout" b
        WHERE b."userId" = ${userId} AND b.status = 'COMPLETED' AND ((b."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date < ${monday}::date
      ) AS before
    FROM w
  `;
  const cur = { volume: row?.cv ?? 0, seconds: row?.cs ?? 0, sets: row?.cn ?? 0, records: row?.cr ?? 0 };
  const prev = row?.before ? { volume: row.pv, seconds: row.ps, sets: row.pn, records: row.pr } : null;
  return { cur, prev };
}

/** Местные дни завершённых тренировок в [monday, sunday]. */
export async function getWorkoutDays(userId: string, tz: string, monday: string, sunday: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT to_char((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day
    FROM "Workout" w
    WHERE w."userId" = ${userId} AND w.status = 'COMPLETED'
      AND w."finishedAt" >= ${new Date(new Date(`${monday}T00:00:00Z`).getTime() - DAY_MS)}
      AND ((w."finishedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date BETWEEN ${monday}::date AND ${sunday}::date
  `;
  return rows.map((r) => r.day);
}

export type DashboardV3Data = { strip: StripDay[]; week: WeekCompareView; activity: Awaited<ReturnType<typeof getActivity>> };

/** Дашборд v3: полоса недели, «Неделя в цифрах» и календарь активности — остальные блоки страница грузит сама. */
export async function getDashboardV3(user: { id: string; timeZone: string }, now = new Date()): Promise<DashboardV3Data> {
  const today = dayKey(now, user.timeZone);
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  const [days, calendar, totals, activity] = await Promise.all([
    getWorkoutDays(user.id, user.timeZone, monday, sunday),
    getCalendar(user.id, monday, sunday, user.timeZone, now),
    getWeekTotals(user.id, user.timeZone, now),
    getActivity(user.id, user.timeZone),
  ]);
  return {
    strip: weekStrip({ today, workoutDays: days, plannedDays: calendar.occurrences.map((o) => o.date) }),
    week: weekCompare(totals.cur, totals.prev),
    activity,
  };
}

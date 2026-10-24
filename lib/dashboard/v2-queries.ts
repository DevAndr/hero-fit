import "server-only";
import type { RecordType } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { addDays, weekStart } from "@/lib/dates";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { getCalendar } from "@/lib/plans/queries";
import { getActivity, getTrends, type Trends } from "@/lib/stats/queries";
import type { StrengthTrend } from "@/lib/stats/strength";
import { getMonthCompare } from "@/lib/stats/strength-queries";
import { weekCompare, weekStrip, type StripDay, type WeekCompareView, type WeekTotals } from "./v2";

/** Дашборд v2 (спека docs/superpowers/specs/2026-10-24-dashboard-v2-design.md): запросы новых виджетов. */

const DAY_MS = 24 * 60 * 60 * 1000;
const RECORDS_DAYS = 30;

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

export type RecentRecord = { exerciseId: string; name: string; type: RecordType; value: number; prev: number; achievedAt: Date };

/**
 * Побитые рекорды за 30 дней — из событий опыта PERSONAL_RECORD (в meta.records — value и previous; PersonalRecord
 * хранит только текущий лучший результат, истории в нём нет). Первый результат в упражнении рекордом не считается —
 * как в «Неделе в цифрах» и статистике. По одному на упражнение: самый свежий, при равенстве 1RM → вес → повторы →
 * время → дистанция; темп («меньше лучше») не показываем.
 */
export async function getRecentRecords(userId: string, limit = 3, now = new Date()): Promise<RecentRecord[]> {
  return db.$queryRaw<RecentRecord[]>`
    SELECT "exerciseId", name, type, value, prev, "achievedAt" FROM (
      SELECT DISTINCT ON (r."exerciseId") r."exerciseId", COALESCE(e.name, r."exerciseName") AS name, r.type::"RecordType" AS type,
             r.value, r.previous AS prev, x."createdAt" AS "achievedAt"
      FROM "XpEvent" x
      CROSS JOIN LATERAL jsonb_to_recordset(CASE WHEN jsonb_typeof(x.meta->'records') = 'array' THEN x.meta->'records' ELSE '[]'::jsonb END)
        AS r("exerciseId" text, "exerciseName" text, type text, value float8, previous float8)
      LEFT JOIN "Exercise" e ON e.id = r."exerciseId"
      WHERE x."userId" = ${userId} AND x.reason = 'PERSONAL_RECORD' AND r.type <> 'BEST_PACE'
        AND x."createdAt" >= ${new Date(now.getTime() - RECORDS_DAYS * DAY_MS)}
      ORDER BY r."exerciseId", x."createdAt" DESC,
        array_position(ARRAY['ONE_RM', 'MAX_WEIGHT', 'MAX_REPS', 'MAX_DURATION', 'MAX_DISTANCE']::text[], r.type)
    ) best
    ORDER BY "achievedAt" DESC
    LIMIT ${limit}
  `;
}

export type DashboardV2Data = {
  strip: StripDay[];
  week: WeekCompareView;
  records: RecentRecord[];
  trends: Trends;
  strength: StrengthTrend | null;
};

/** Данные новых виджетов одним пакетом; остальное (серия, план, баланс мышц, игра) страница берёт из прежних запросов. */
export async function getDashboardV2(user: { id: string; timeZone: string }, now = new Date()): Promise<DashboardV2Data> {
  const today = dayKey(now, user.timeZone);
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);
  const [days, calendar, totals, records, trends, strength] = await Promise.all([
    getWorkoutDays(user.id, user.timeZone, monday, sunday),
    getCalendar(user.id, monday, sunday, user.timeZone, now),
    getWeekTotals(user.id, user.timeZone, now),
    getRecentRecords(user.id, 3, now),
    getTrends(user.id, user.timeZone),
    isEnabled("strength_analytics", user.id).then(async (on) => (on ? (await getMonthCompare(user.id, user.timeZone, now)).strength : null)),
  ]);
  return {
    strip: weekStrip({ today, workoutDays: days, plannedDays: calendar.occurrences.map((o) => o.date) }),
    week: weekCompare(totals.cur, totals.prev),
    records,
    trends,
    strength,
  };
}

export type DashboardV3Data = Pick<DashboardV2Data, "strip" | "week"> & { activity: Trends["activity"] };

/** Дашборд v3 (флаг dashboard_v3): полоса недели, «Неделя в цифрах» и календарь активности — остальное берёт прежний дашборд. */
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

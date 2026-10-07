import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";
import { localMidnight } from "@/lib/progress/weekly-streak";
import { parsePlanKey } from "@/lib/plans/edit";
import { addDays, entryKey, expandPlans, seriesKey, weekdayOf, type Occurrence, type PlanEntryRow, type PlanSeriesRow } from "@/lib/plans/expand";
import { matchPlans, type MatchedOccurrence } from "@/lib/plans/match";

const seriesSelect = {
  id: true,
  templateId: true,
  title: true,
  weekday: true,
  time: true,
  durationMin: true,
  startDate: true,
  endDate: true,
} as const;
const entrySelect = {
  id: true,
  seriesId: true,
  originalDate: true,
  templateId: true,
  title: true,
  date: true,
  time: true,
  durationMin: true,
  cancelled: true,
} as const;

/** Серии и записи, нужные для вхождений в [from, to] (включая перенесённые в диапазон и из него). */
async function loadPlans(userId: string, from: string, to: string): Promise<{ series: PlanSeriesRow[]; entries: PlanEntryRow[] }> {
  const entries = await db.planEntry.findMany({
    where: { userId, OR: [{ date: { gte: from, lte: to } }, { originalDate: { gte: from, lte: to } }] },
    select: entrySelect,
  });
  const referenced = [...new Set(entries.map((e) => e.seriesId).filter((id): id is string => id !== null))];
  const series = await db.planSeries.findMany({
    where: {
      userId,
      OR: [{ startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] }, { id: { in: referenced } }],
    },
    select: seriesSelect,
  });
  return { series, entries };
}

export type CalendarExtraWorkout = { id: string; name: string; startedAt: Date; finishedAt: Date };
export type CalendarData = {
  occurrences: MatchedOccurrence[];
  extra: CalendarExtraWorkout[];
  /** Активная тренировка, запущенная из плана: у её вхождения — «Продолжить». */
  activePlanKey: string | null;
  templates: Record<string, { name: string; exercises: number }>;
};

/** Календарь на [from, to]: вхождения со статусами, тренировки вне плана, шаблоны для карточек. */
export async function getCalendar(userId: string, from: string, to: string, tz: string, now = new Date()): Promise<CalendarData> {
  const [{ series, entries }, workouts, active] = await Promise.all([
    loadPlans(userId, from, to),
    db.workout.findMany({
      where: {
        userId,
        status: WorkoutStatus.COMPLETED,
        finishedAt: { gte: localMidnight(from, tz), lt: localMidnight(addDays(to, 1), tz) },
      },
      select: { id: true, name: true, planKey: true, startedAt: true, finishedAt: true },
    }),
    db.workout.findFirst({ where: { userId, status: { in: ACTIVE_STATUSES } }, select: { planKey: true } }),
  ]);
  const done = workouts
    .filter((w) => w.startedAt && w.finishedAt)
    .map((w) => ({ id: w.id, planKey: w.planKey, startedAt: w.startedAt!, finishedAt: w.finishedAt! }));
  const matched = matchPlans(expandPlans(series, entries, from, to), done, dayKey(now, tz), tz);
  const names = new Map(workouts.map((w) => [w.id, w.name]));

  const templateIds = [...new Set(matched.occurrences.map((o) => o.templateId).filter((id): id is string => id !== null))];
  const templates = await db.workoutTemplate.findMany({
    where: { id: { in: templateIds }, OR: [{ userId }, { userId: null }] },
    select: { id: true, name: true, _count: { select: { exercises: true } } },
  });

  return {
    occurrences: matched.occurrences,
    extra: matched.extra.map((w) => ({ id: w.id, name: names.get(w.id) ?? "Тренировка", startedAt: w.startedAt, finishedAt: w.finishedAt })),
    activePlanKey: active?.planKey ?? null,
    templates: Object.fromEntries(templates.map((t) => [t.id, { name: t.name, exercises: t._count.exercises }])),
  };
}

/** Для дашборда и /training: планы на сегодня, ближайший следующий, пропущенный вчера. */
export async function getTodayPlan(userId: string, tz: string, now = new Date()) {
  const today = dayKey(now, tz);
  const calendar = await getCalendar(userId, addDays(today, -1), addDays(today, 13), tz, now);
  const { occurrences } = calendar;
  const todays = occurrences.filter((o) => o.status === "today");
  return {
    today: todays,
    next: todays.length ? null : (occurrences.find((o) => o.status === "planned") ?? null),
    missedYesterday: occurrences.find((o) => o.status === "missed" && o.date === addDays(today, -1)) ?? null,
    activePlanKey: calendar.activePlanKey,
    templates: calendar.templates,
  };
}

/** Одно вхождение по ключу (только своё и не отменённое). */
export async function getOccurrence(userId: string, key: string): Promise<{ occurrence: Occurrence; series: PlanSeriesRow | null } | null> {
  const parsed = parsePlanKey(key);
  if (!parsed) return null;
  if (parsed.kind === "entry") {
    const entry = await db.planEntry.findFirst({ where: { id: parsed.entryId, userId, seriesId: null }, select: entrySelect });
    if (!entry || entry.cancelled) return null;
    return { occurrence: { ...entry, key: entryKey(entry.id), recurring: false }, series: null };
  }
  const series = await db.planSeries.findFirst({ where: { id: parsed.seriesId, userId }, select: seriesSelect });
  if (!series) return null;
  const exception = await db.planEntry.findFirst({
    where: { seriesId: series.id, originalDate: parsed.date },
    select: entrySelect,
  });
  const base = { key: seriesKey(series.id, parsed.date), seriesId: series.id, recurring: true };
  if (exception) {
    if (exception.cancelled) return null;
    const { date, time, durationMin, templateId, title } = exception;
    return { occurrence: { ...base, date, time, durationMin, templateId, title }, series };
  }
  const active = parsed.date >= series.startDate && (!series.endDate || parsed.date <= series.endDate);
  if (!active || weekdayOf(parsed.date) !== series.weekday) return null;
  const { time, durationMin, templateId, title } = series;
  return { occurrence: { ...base, date: parsed.date, time, durationMin, templateId, title }, series };
}

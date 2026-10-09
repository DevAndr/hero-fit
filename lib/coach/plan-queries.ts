import "server-only";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays, entryKey, seriesKey, type Occurrence } from "@/lib/plans/expand";
import type { MatchedOccurrence } from "@/lib/plans/match";
import { getCalendar } from "@/lib/plans/queries";
import { weekKey } from "@/lib/progress/weekly-streak";

export type CoachPlanItem = MatchedOccurrence | (Occurrence & { status: "skipped"; workoutId?: undefined });

const UPCOMING_DAYS = 14;
const PAST_DAYS = 28;

/**
 * Назначения этого тренера клиенту: ближайшие 2 недели (с сегодня) и прошлые 4 недели (новые сверху).
 * «Пропущено клиентом» — отменённые клиентом вхождения: разовые от тренера и исключения его серий,
 * отменённые без пометки тренера (своё «удалить только эту» тренер помечает coachId — такие не показываем).
 */
export async function getClientPlan(coachId: string, clientId: string, tz: string, now = new Date()) {
  const today = dayKey(now, tz);
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, UPCOMING_DAYS - 1);
  const [calendar, cancelled] = await Promise.all([
    getCalendar(clientId, from, to, tz, now),
    db.planEntry.findMany({
      where: {
        userId: clientId,
        cancelled: true,
        date: { gte: from, lte: to },
        OR: [{ seriesId: null, coachId }, { series: { coachId }, coachId: null }],
      },
      select: { id: true, seriesId: true, originalDate: true, templateId: true, title: true, date: true, time: true, durationMin: true },
    }),
  ]);
  const skipped: CoachPlanItem[] = cancelled.map((e) => ({
    key: e.seriesId && e.originalDate ? seriesKey(e.seriesId, e.originalDate) : entryKey(e.id),
    seriesId: e.seriesId,
    date: e.date,
    time: e.time,
    durationMin: e.durationMin,
    templateId: e.templateId,
    title: e.title,
    recurring: e.seriesId !== null,
    coachId,
    status: "skipped",
  }));
  const mine: CoachPlanItem[] = [...calendar.occurrences.filter((o) => o.coachId === coachId), ...skipped];
  const byTime = (a: CoachPlanItem, b: CoachPlanItem) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date));
  return {
    upcoming: mine.filter((o) => o.date >= today).sort(byTime),
    past: mine.filter((o) => o.date < today).sort((a, b) => byTime(b, a)),
  };
}

/** «план 2/3» в списке клиентов: назначения этого тренера на текущую неделю клиента; null — назначений нет. */
export async function getClientWeekPlan(coachId: string, clientId: string, tz: string, now = new Date()) {
  const monday = weekKey(now, tz);
  const { occurrences } = await getCalendar(clientId, monday, addDays(monday, 6), tz, now);
  const mine = occurrences.filter((o) => o.coachId === coachId);
  return mine.length ? { done: mine.filter((o) => o.status === "done").length, total: mine.length } : null;
}

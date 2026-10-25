import type { PlanStatus } from "@/lib/plans/match";

/** Календарь тренера по всем клиентам: статусы, порядок в дне, превью месяца, сводка (чистые). */

export type CoachCalendarStatus = "done" | "skipped" | "missed" | "upcoming";

export type CoachCalendarItem = {
  key: string;
  clientId: string;
  clientName: string;
  clientTz: string;
  date: string;
  time: string;
  title: string;
  status: CoachCalendarStatus;
};

/**
 * Клиентов, чей календарь считается одновременно: у каждого ~5 параллельных запросов, пул pg по умолчанию — 10
 * соединений; больше — и запросы других пользователей ждут очереди.
 */
export const CALENDAR_CONCURRENCY = 2;

/** «Сегодня» и «впереди» — одно: невыполненное в свой день ещё не пропуск. */
export function statusOf(status: PlanStatus | "skipped"): CoachCalendarStatus {
  if (status === "done" || status === "missed" || status === "skipped") return status;
  return "upcoming";
}

export function groupByDay(items: CoachCalendarItem[]): Map<string, CoachCalendarItem[]> {
  const sorted = [...items].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.clientName.localeCompare(b.clientName, "ru"),
  );
  const days = new Map<string, CoachCalendarItem[]>();
  for (const i of sorted) days.set(i.date, [...(days.get(i.date) ?? []), i]);
  return days;
}

export function dayPreview<T>(items: T[], limit = 3): { shown: T[]; more: number } {
  return { shown: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

/** past — выполненные, не выполненные и отменённые в прошедшие дни (`today` — тренера; отменённое заранее — не прошедшее). */
export function calendarSummary(items: CoachCalendarItem[], today: string): { workouts: number; clients: number; done: number; past: number } {
  const past = items.filter((i) => i.status === "done" || i.status === "missed" || (i.status === "skipped" && i.date < today));
  return {
    workouts: items.length,
    clients: new Set(items.map((i) => i.clientId)).size,
    done: past.filter((i) => i.status === "done").length,
    past: past.length,
  };
}

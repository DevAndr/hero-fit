import { plural } from "../format";
import { localMidnight } from "../progress/weekly-streak";
import type { Occurrence } from "./expand";
import { minutesOf } from "./match";

export const PLAN_REMINDER_LEADS = [15, 30, 60, 120] as const;

/** Момент начала вхождения: местные дата и время в поясе tz. */
export const occurrenceStart = (o: Pick<Occurrence, "date" | "time">, tz: string) =>
  new Date(localMidnight(o.date, tz).getTime() + minutesOf(o.time) * 60_000);

/**
 * «Сегодня по плану»: вхождения с началом в (now, now + leadMin], ещё не напомненные и не выполненные.
 * Пока идёт тренировка — не напоминаем.
 */
export function duePlanReminders(
  occurrences: Occurrence[],
  opts: { now: Date; tz: string; leadMin: number; sentKeys: Set<string>; doneKeys: Set<string>; hasActiveWorkout: boolean },
): Occurrence[] {
  if (opts.hasActiveWorkout) return [];
  const now = opts.now.getTime();
  const until = now + opts.leadMin * 60_000;
  return occurrences.filter((o) => {
    if (opts.sentKeys.has(o.key) || opts.doneKeys.has(o.key)) return false;
    const start = occurrenceStart(o, opts.tz).getTime();
    return start > now && start <= until;
  });
}

export function planReminderText(o: Pick<Occurrence, "title" | "time" | "date">, exercises: number | null, today: string) {
  return {
    title: `${o.date === today ? "Сегодня" : "Скоро"} по плану: ${o.title} 💪`,
    body: `В ${o.time}${exercises ? ` · ${exercises} ${plural(exercises, "упражнение", "упражнения", "упражнений")}` : ""}`,
  };
}

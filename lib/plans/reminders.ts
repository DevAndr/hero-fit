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
 * Пока идёт тренировка (запущенная, не черновик) — не напоминаем.
 */
export function duePlanReminders(
  occurrences: Occurrence[],
  opts: { now: Date; tz: string; leadMin: number; sentKeys: Set<string>; doneKeys: Set<string>; hasRunningWorkout: boolean },
): Occurrence[] {
  if (opts.hasRunningWorkout) return [];
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

/** Куда ведёт уведомление: на привязанный к вхождению черновик — сразу к тренировке, иначе в календарь. */
export function planReminderUrl(o: Pick<Occurrence, "key" | "date">, activePlanKey: string | null): string {
  return activePlanKey !== null && activePlanKey === o.key ? "/training" : `/calendar?date=${o.date}`;
}

export function planReminderMail(o: Pick<Occurrence, "title" | "time" | "date">, today: string, appUrl: string) {
  return {
    subject: `Тренировка ${o.date === today ? "сегодня" : "завтра"} в ${o.time}`,
    text: [
      `${o.title} — в ${o.time}.`,
      "",
      `Открыть тренировку: ${new URL("/training", appUrl).toString()}`,
      "",
      "Вы попросили напомнить об этой тренировке в Hero Fit.",
    ].join("\n"),
  };
}

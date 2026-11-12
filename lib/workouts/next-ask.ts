import { dayKey } from "../daily-login";
import { addDays } from "../dates";
import { timeOf } from "../plans/match";
import { occurrenceStart } from "../plans/reminders";
import { SCHEDULE_TIME, type Slot } from "./schedule";

/** «Свежее» завершение: окно карточек рекордов и вопроса «Когда следующая?» в сводке — 6 ч. */
export const FRESH_FINISH_MS = 6 * 60 * 60 * 1000;
/** Насколько вперёд смотрим запланированное: есть план — не спрашиваем. */
export const NEXT_ASK_HORIZON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isFreshFinish(finishedAt: Date | null, now: Date): boolean {
  return finishedAt !== null && now.getTime() - finishedAt.getTime() < FRESH_FINISH_MS;
}

/** Показывать ли карточку «Когда следующая тренировка?» в сводке. */
export function shouldAskNext(p: {
  enabled: boolean;
  owner: boolean;
  hasUpcoming: boolean;
  now: Date;
  workout: { status: string; stretchOnly: boolean; finishedAt: Date | null; scheduleAskedAt: Date | null };
}): boolean {
  const w = p.workout;
  return (
    p.enabled &&
    p.owner &&
    w.status === "COMPLETED" &&
    !w.stretchOnly &&
    isFreshFinish(w.finishedAt, p.now) &&
    w.scheduleAskedAt === null &&
    !p.hasUpcoming
  );
}

/** Минуты от полуночи → «HH:MM», округлённые до ближайших 30 минут (15 — вверх); 23:45+ → «00:00». */
export function roundToHalfHour(minutes: number): string {
  return timeOf((Math.round(minutes / 30) * 30) % (24 * 60));
}

function localMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((x) => x.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * «Завтра» и «Послезавтра» — по календарю пользователя от текущего момента; время — местное время начала этой тренировки,
 * округлённое до 30 минут (округление через полночь не сдвигает день слота), без startedAt — SCHEDULE_TIME.
 */
export function nextPresets(now: Date, tz: string, startedAt: Date | null): { tomorrow: Slot; dayAfter: Slot } {
  const today = dayKey(now, tz);
  const time = startedAt ? roundToHalfHour(localMinutes(startedAt, tz)) : SCHEDULE_TIME;
  return { tomorrow: { date: addDays(today, 1), time }, dayAfter: { date: addDays(today, 2), time } };
}

/** Есть ли невыполненное вхождение календаря с началом в (now, now + 7 дней]. */
export function hasUpcomingPlan(occurrences: { date: string; time: string; status: string }[], now: Date, tz: string): boolean {
  const until = now.getTime() + NEXT_ASK_HORIZON_DAYS * DAY_MS;
  return occurrences.some((o) => {
    if (o.status === "done") return false;
    const start = occurrenceStart(o, tz).getTime();
    return start > now.getTime() && start <= until;
  });
}

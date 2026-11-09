import { dayKey, localHour, safeTimeZone } from "../daily-login";
import { addDays } from "../dates";
import { occurrenceStart } from "../plans/reminders";

/** Пояс диалога: cookie браузера точнее User.timeZone (у новичка там ещё UTC по умолчанию); некорректная cookie — как будто её нет. */
export function scheduleTimeZone(cookie: string | undefined, stored: string | undefined): string {
  return cookie && safeTimeZone(cookie) === cookie ? cookie : safeTimeZone(stored);
}

/** Время по умолчанию для быстрых вариантов диалога «Когда тренировка?». */
export const SCHEDULE_TIME = "19:00";
/** С этого местного часа вариант «Сегодня вечером» не предлагаем. */
export const EVENING_CUTOFF_HOUR = 18;
/** Дальше скольких дней вперёд планировать нельзя. */
export const MAX_SCHEDULE_DAYS = 30;

export type Slot = { date: string; time: string };

/** Спрашивать ли «Когда тренировка?»: только новичка с неспрошенным черновиком без привязки к плану. */
export function shouldAskSchedule(
  w: { status: string; planKey: string | null; courseId?: string | null; scheduleAskedAt: Date | null },
  completed: number,
): boolean {
  return completed === 0 && w.status === "PLANNED" && !w.planKey && !w.courseId && !w.scheduleAskedAt;
}

/** Быстрые варианты: сегодня вечером (до 18:00 по местному) и завтра, оба в 19:00. */
export function schedulePresets(now: Date, tz: string): { evening: Slot | null; tomorrow: Slot } {
  const { day, hour } = localHour(now, tz);
  return {
    evening: hour < EVENING_CUTOFF_HOUR ? { date: day, time: SCHEDULE_TIME } : null,
    tomorrow: { date: addDays(day, 1), time: SCHEDULE_TIME },
  };
}

/** Текст ошибки для выбранного слота или null, если он годится. */
export function slotError(slot: Slot, now: Date, tz: string): string | null {
  if (occurrenceStart(slot, tz).getTime() <= now.getTime()) return "Выберите время в будущем";
  if (slot.date > addDays(dayKey(now, tz), MAX_SCHEDULE_DAYS)) return "Можно запланировать не дальше чем на 30 дней";
  return null;
}

import { z } from "zod";
import { Meal } from "@/generated/prisma/enums";
import { dayKey, safeTimeZone } from "@/lib/daily-login";

// Напоминания о приёмах пищи (спека 2026-11-13-meal-reminders-design). Чистые функции:
// файл импортирует клиентский диалог, поэтому без server-only и клиента Prisma.

export const MAX_MEAL_REMINDERS = 6;
/** Окно после заданного времени, в котором напоминание ещё можно отправить (минуты). */
export const MEAL_REMIND_WINDOW_MIN = 60;

const DAY_MINUTES = 1440;
const STEP_MIN = 30;

export const mealReminderSchema = z.object({
  meal: z.enum(Meal),
  minutes: z.number().int().min(0).max(1439),
});

const TITLES: Record<Meal, string> = { BREAKFAST: "Завтрак", LUNCH: "Обед", DINNER: "Ужин", SNACK: "Перекус" };
const NOUNS: Record<Meal, string> = { BREAKFAST: "завтрак", LUNCH: "обед", DINNER: "ужин", SNACK: "перекус" };

/** Порядок «по ходу дня» и время по умолчанию. */
const DEFAULTS: { meal: Meal; minutes: number }[] = [
  { meal: "BREAKFAST", minutes: 540 },
  { meal: "LUNCH", minutes: 840 },
  { meal: "SNACK", minutes: 1020 },
  { meal: "DINNER", minutes: 1200 },
];

/** «HH:MM» → минуты от полуночи; null, если формат неверный. */
export function parseTime(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Минуты от местной полуночи. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Время напоминания сегодня уже наступило (или совпало с текущей минутой). */
export function alreadyPassedToday(now: Date, timeZone: string, minutes: number): boolean {
  return localMinutes(now, timeZone) >= minutes;
}

/** Пора ли слать: время наступило не более часа назад (в тот же местный день), и сегодня ещё не решали. */
export function mealReminderDue(input: {
  now: Date;
  timeZone: string;
  minutes: number;
  enabled: boolean;
  remindedDay: string | null;
}): { day: string } | null {
  if (!input.enabled) return null;
  const day = dayKey(input.now, safeTimeZone(input.timeZone));
  if (input.remindedDay === day) return null;
  const since = localMinutes(input.now, input.timeZone) - input.minutes;
  if (since < 0 || since >= MEAL_REMIND_WINDOW_MIN) return null;
  return { day };
}

export function mealReminderText(meal: Meal, minutes: number): { title: string; body: string } {
  return { title: `${TITLES[meal]} · ${formatTime(minutes)}`, body: `Запишите ${NOUNS[meal]} в дневник` };
}

/** Приём и время для новой строки; null, если достигнут лимит. */
export function nextDefault(existing: { meal: Meal; minutes: number }[]): { meal: Meal; minutes: number } | null {
  if (existing.length >= MAX_MEAL_REMINDERS) return null;
  const taken = new Set(existing.map((e) => e.minutes));
  const free = (from: number) => {
    let t = from;
    while (taken.has(t)) t = (t + STEP_MIN) % DAY_MINUTES;
    return t;
  };
  const next = DEFAULTS.find((d) => !existing.some((e) => e.meal === d.meal));
  if (next) return { meal: next.meal, minutes: free(next.minutes) };
  const last = Math.max(...existing.map((e) => e.minutes));
  return { meal: "SNACK", minutes: free((last + STEP_MIN) % DAY_MINUTES) };
}

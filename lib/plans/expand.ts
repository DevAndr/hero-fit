/**
 * Календарь тренировок: повторяющиеся серии (каждую неделю в день weekday) и записи — разовые или исключения
 * из серии (перенос / отмена одной даты). Даты — «YYYY-MM-DD», время — «HH:MM» местного времени пользователя.
 */

export type PlanSeriesRow = {
  id: string;
  templateId: string | null;
  title: string;
  /** 0 = понедельник … 6 = воскресенье */
  weekday: number;
  time: string;
  durationMin: number;
  startDate: string;
  endDate: string | null;
  /** Назначил тренер (этап 2 режима тренера); null — свой план. */
  coachId: string | null;
};

export type PlanEntryRow = {
  id: string;
  seriesId: string | null;
  originalDate: string | null;
  templateId: string | null;
  title: string;
  date: string;
  time: string;
  durationMin: number;
  cancelled: boolean;
  /** У разовой — кто назначил; у исключения серии не читается (берётся из серии). */
  coachId: string | null;
};

export type Occurrence = {
  /** s:<seriesId>:<originalDate> — вхождение серии (в том числе перенесённое), e:<entryId> — разовая запись */
  key: string;
  seriesId: string | null;
  date: string;
  time: string;
  durationMin: number;
  templateId: string | null;
  title: string;
  recurring: boolean;
  /** Назначил тренер: у вхождения серии и её исключения — из серии, у разовой — из записи. */
  coachId: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Полдень UTC — арифметика дат без влияния переходов на летнее время. */
const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);

export const addDays = (date: string, n: number) => new Date(noon(date) + n * DAY_MS).toISOString().slice(0, 10);
export const weekdayOf = (date: string) => (new Date(noon(date)).getUTCDay() + 6) % 7;

export const seriesKey = (seriesId: string, date: string) => `s:${seriesId}:${date}`;
export const entryKey = (entryId: string) => `e:${entryId}`;

/** Вхождения в диапазоне дат [from, to] включительно, по дате и времени. */
export function expandPlans(series: PlanSeriesRow[], entries: PlanEntryRow[], from: string, to: string): Occurrence[] {
  const inRange = (date: string) => date >= from && date <= to;
  const exceptions = new Map<string, PlanEntryRow>();
  for (const e of entries) if (e.seriesId && e.originalDate) exceptions.set(seriesKey(e.seriesId, e.originalDate), e);

  const result: Occurrence[] = [];
  for (const s of series) {
    const first = s.startDate > from ? s.startDate : from;
    const last = s.endDate && s.endDate < to ? s.endDate : to;
    // Первая дата с нужным днём недели не раньше first
    for (let date = addDays(first, (s.weekday - weekdayOf(first) + 7) % 7); date <= last; date = addDays(date, 7)) {
      const key = seriesKey(s.id, date);
      if (exceptions.has(key)) continue; // исключение разворачивается ниже — по своей новой дате
      result.push({ key, seriesId: s.id, date, time: s.time, durationMin: s.durationMin, templateId: s.templateId, title: s.title, recurring: true, coachId: s.coachId });
    }
  }
  const coachOf = new Map(series.map((s) => [s.id, s.coachId]));
  for (const e of entries) {
    if (e.cancelled || !inRange(e.date)) continue;
    const exception = e.seriesId !== null && e.originalDate !== null;
    if (exception && !coachOf.has(e.seriesId!)) continue;
    result.push({
      key: exception ? seriesKey(e.seriesId!, e.originalDate!) : entryKey(e.id),
      seriesId: e.seriesId,
      date: e.date,
      time: e.time,
      durationMin: e.durationMin,
      templateId: e.templateId,
      title: e.title,
      recurring: exception,
      coachId: exception ? coachOf.get(e.seriesId!)! : e.coachId,
    });
  }
  return result.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

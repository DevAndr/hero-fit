import { addDays, weekdayOf, type Occurrence, type PlanSeriesRow } from "./expand";

/** Разбор ключа вхождения: s:<seriesId>:<YYYY-MM-DD> или e:<entryId>. */
export function parsePlanKey(key: string): { kind: "series"; seriesId: string; date: string } | { kind: "entry"; entryId: string } | null {
  const series = /^s:([A-Za-z0-9_-]+):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (series) {
    const [, seriesId, date] = series;
    return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
      ? null
      : { kind: "series", seriesId, date };
  }
  const entry = /^e:([A-Za-z0-9_-]+)$/.exec(key);
  return entry ? { kind: "entry", entryId: entry[1] } : null;
}

export type PlanPatch = { date?: string; time?: string; durationMin?: number; templateId?: string | null; title?: string };
export type PlanScope = "one" | "following";
type OccurrenceFields = Pick<Occurrence, "date" | "time" | "durationMin" | "templateId" | "title">;
type SeriesData = Omit<PlanSeriesRow, "id">;

export type PlanOp =
  | { op: "upsertException"; seriesId: string; originalDate: string; cancelled: boolean; data: OccurrenceFields }
  | { op: "endSeries"; seriesId: string; endDate: string }
  | { op: "deleteSeries"; seriesId: string }
  | { op: "deleteExceptionsFrom"; seriesId: string; fromDate: string }
  | { op: "createSeries"; data: SeriesData }
  | { op: "updateEntry"; entryId: string; data: PlanPatch }
  | { op: "deleteEntry"; entryId: string }
  /** Пропуск разовой от тренера: запись остаётся отменённой — тренер видит «пропущено клиентом». */
  | { op: "cancelEntry"; entryId: string };

export type PlanTarget =
  | { kind: "series"; series: PlanSeriesRow; originalDate: string; occurrence: Occurrence }
  | { kind: "entry"; entryId: string };

/**
 * Что сделать с БД при правке (patch) или удалении (patch = null) вхождения.
 * «Только это» — исключение для даты; «Это и следующие» — серия обрывается накануне, дальше — новая серия (как в Google).
 */
export function planEdit(target: PlanTarget, scope: PlanScope, patch: PlanPatch | null): PlanOp[] {
  if (target.kind === "entry") {
    return patch ? [{ op: "updateEntry", entryId: target.entryId, data: patch }] : [{ op: "deleteEntry", entryId: target.entryId }];
  }
  const { series, originalDate, occurrence } = target;
  const fields: OccurrenceFields = {
    date: occurrence.date,
    time: occurrence.time,
    durationMin: occurrence.durationMin,
    templateId: occurrence.templateId,
    title: occurrence.title,
  };

  if (scope === "one") {
    return [{ op: "upsertException", seriesId: series.id, originalDate, cancelled: !patch, data: { ...fields, ...patch } }];
  }

  const ops: PlanOp[] =
    originalDate <= series.startDate
      ? [{ op: "deleteSeries", seriesId: series.id }]
      : [
          { op: "endSeries", seriesId: series.id, endDate: addDays(originalDate, -1) },
          { op: "deleteExceptionsFrom", seriesId: series.id, fromDate: originalDate },
        ];
  if (!patch) return ops;
  const startDate = patch.date ?? originalDate;
  ops.push({
    op: "createSeries",
    data: {
      templateId: patch.templateId !== undefined ? patch.templateId : series.templateId,
      title: patch.title ?? series.title,
      weekday: weekdayOf(startDate),
      time: patch.time ?? series.time,
      durationMin: patch.durationMin ?? series.durationMin,
      startDate,
      endDate: series.endDate,
      coachId: series.coachId,
    },
  });
  return ops;
}

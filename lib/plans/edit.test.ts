import { describe, expect, it } from "vitest";
import type { Occurrence, PlanSeriesRow } from "./expand";
import { parsePlanKey, planEdit } from "./edit";

const series: PlanSeriesRow = {
  id: "s1",
  templateId: "t1",
  title: "Ноги",
  weekday: 0,
  time: "18:00",
  durationMin: 60,
  startDate: "2026-09-07",
  endDate: null,
};
const occurrence = (date: string, patch: Partial<Occurrence> = {}): Occurrence => ({
  key: `s:s1:${date}`,
  seriesId: "s1",
  date,
  time: "18:00",
  durationMin: 60,
  templateId: "t1",
  title: "Ноги",
  recurring: true,
  ...patch,
});
const target = (date: string, patch: Partial<Occurrence> = {}) =>
  ({ kind: "series", series, originalDate: date, occurrence: occurrence(date, patch) }) as const;

describe("parsePlanKey", () => {
  it("series and entry keys", () => {
    expect(parsePlanKey("s:cmabc123:2026-10-05")).toEqual({ kind: "series", seriesId: "cmabc123", date: "2026-10-05" });
    expect(parsePlanKey("e:cmxyz")).toEqual({ kind: "entry", entryId: "cmxyz" });
  });
  it("garbage", () => {
    for (const k of ["", "s:x", "s:x:2026-13-01", "e:", "x:1", "s:a:b:2026-10-05"]) expect(parsePlanKey(k)).toBeNull();
  });
});

describe("planEdit — only this one", () => {
  it("move creates an exception with the occurrence fields overridden by the patch", () => {
    expect(planEdit(target("2026-10-05"), "one", { date: "2026-10-06", time: "10:00" })).toEqual([
      {
        op: "upsertException",
        seriesId: "s1",
        originalDate: "2026-10-05",
        cancelled: false,
        data: { date: "2026-10-06", time: "10:00", durationMin: 60, templateId: "t1", title: "Ноги" },
      },
    ]);
  });

  it("an already moved occurrence keeps its moved fields", () => {
    const ops = planEdit(target("2026-10-05", { date: "2026-10-06", time: "10:00" }), "one", { durationMin: 90 });
    expect(ops[0]).toMatchObject({ data: { date: "2026-10-06", time: "10:00", durationMin: 90 } });
  });

  it("delete cancels the occurrence", () => {
    expect(planEdit(target("2026-10-05"), "one", null)).toEqual([
      {
        op: "upsertException",
        seriesId: "s1",
        originalDate: "2026-10-05",
        cancelled: true,
        data: { date: "2026-10-05", time: "18:00", durationMin: 60, templateId: "t1", title: "Ноги" },
      },
    ]);
  });
});

describe("planEdit — this and following", () => {
  it("ends the series the day before and starts a new one from the new date", () => {
    expect(planEdit(target("2026-10-05"), "following", { date: "2026-10-07", time: "07:00" })).toEqual([
      { op: "endSeries", seriesId: "s1", endDate: "2026-10-04" },
      { op: "deleteExceptionsFrom", seriesId: "s1", fromDate: "2026-10-05" },
      {
        op: "createSeries",
        data: { templateId: "t1", title: "Ноги", weekday: 2, time: "07:00", durationMin: 60, startDate: "2026-10-07", endDate: null },
      },
    ]);
  });

  it("on the first occurrence the old series is deleted, not ended before it starts", () => {
    const ops = planEdit(target("2026-09-07"), "following", { time: "19:00" });
    expect(ops.map((o) => o.op)).toEqual(["deleteSeries", "createSeries"]);
    expect(ops[1]).toMatchObject({ data: { weekday: 0, startDate: "2026-09-07", time: "19:00" } });
  });

  it("delete this and following", () => {
    expect(planEdit(target("2026-10-05"), "following", null)).toEqual([
      { op: "endSeries", seriesId: "s1", endDate: "2026-10-04" },
      { op: "deleteExceptionsFrom", seriesId: "s1", fromDate: "2026-10-05" },
    ]);
    expect(planEdit(target("2026-09-07"), "following", null)).toEqual([{ op: "deleteSeries", seriesId: "s1" }]);
  });
});

describe("planEdit — single entry", () => {
  it("updates or deletes the entry itself", () => {
    expect(planEdit({ kind: "entry", entryId: "e1" }, "one", { time: "08:00" })).toEqual([
      { op: "updateEntry", entryId: "e1", data: { time: "08:00" } },
    ]);
    expect(planEdit({ kind: "entry", entryId: "e1" }, "following", null)).toEqual([{ op: "deleteEntry", entryId: "e1" }]);
  });
});

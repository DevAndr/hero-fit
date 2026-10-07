import { describe, expect, it } from "vitest";
import { addDays, expandPlans, weekdayOf, type PlanEntryRow, type PlanSeriesRow } from "./expand";

const series = (patch: Partial<PlanSeriesRow> = {}): PlanSeriesRow => ({
  id: "s1",
  templateId: "t1",
  title: "Ноги",
  weekday: 0, // пн
  time: "18:00",
  durationMin: 60,
  startDate: "2026-09-01",
  endDate: null,
  ...patch,
});
const entry = (patch: Partial<PlanEntryRow> = {}): PlanEntryRow => ({
  id: "e1",
  seriesId: null,
  originalDate: null,
  templateId: null,
  title: "Кардио",
  date: "2026-10-07",
  time: "07:30",
  durationMin: 45,
  cancelled: false,
  ...patch,
});

describe("date helpers", () => {
  it("weekdayOf: 0 = Monday", () => {
    expect(weekdayOf("2026-10-05")).toBe(0);
    expect(weekdayOf("2026-10-11")).toBe(6);
  });
  it("addDays across months and DST", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
  });
});

describe("expandPlans", () => {
  it("weekly series inside the range", () => {
    const occ = expandPlans([series()], [], "2026-10-05", "2026-10-18");
    expect(occ.map((o) => [o.key, o.date, o.time])).toEqual([
      ["s:s1:2026-10-05", "2026-10-05", "18:00"],
      ["s:s1:2026-10-12", "2026-10-12", "18:00"],
    ]);
    expect(occ[0]).toMatchObject({ seriesId: "s1", templateId: "t1", title: "Ноги", durationMin: 60, recurring: true });
  });

  it("respects startDate and endDate (inclusive)", () => {
    const occ = expandPlans([series({ startDate: "2026-10-06", endDate: "2026-10-19" })], [], "2026-09-28", "2026-10-31");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-12", "2026-10-19"]);
  });

  it("exception moves one occurrence; the key keeps the original date", () => {
    const moved = entry({ id: "x1", seriesId: "s1", originalDate: "2026-10-05", date: "2026-10-06", time: "10:00", title: "Ноги" });
    const occ = expandPlans([series()], [moved], "2026-10-05", "2026-10-11");
    expect(occ).toEqual([
      {
        key: "s:s1:2026-10-05",
        seriesId: "s1",
        date: "2026-10-06",
        time: "10:00",
        durationMin: 45,
        templateId: null,
        title: "Ноги",
        recurring: true,
      },
    ]);
  });

  it("an occurrence moved to the next week leaves this week and shows up in that one", () => {
    const moved = entry({ id: "x1", seriesId: "s1", originalDate: "2026-10-05", date: "2026-10-14", time: "18:00" });
    expect(expandPlans([series()], [moved], "2026-10-05", "2026-10-11")).toEqual([]);
    const next = expandPlans([series()], [moved], "2026-10-12", "2026-10-18");
    expect(next.map((o) => [o.key, o.date])).toEqual([
      ["s:s1:2026-10-12", "2026-10-12"],
      ["s:s1:2026-10-05", "2026-10-14"],
    ]);
  });

  it("cancelled exception removes the occurrence", () => {
    const cancelled = entry({ seriesId: "s1", originalDate: "2026-10-05", date: "2026-10-05", cancelled: true });
    expect(expandPlans([series()], [cancelled], "2026-10-05", "2026-10-11")).toEqual([]);
  });

  it("single entries, sorted by date and time", () => {
    const occ = expandPlans(
      [series({ weekday: 2 })],
      [entry(), entry({ id: "e2", date: "2026-10-07", time: "20:00" }), entry({ id: "e3", date: "2026-10-20", cancelled: true })],
      "2026-10-05",
      "2026-10-11",
    );
    expect(occ.map((o) => [o.key, o.time, o.recurring])).toEqual([
      ["e:e1", "07:30", false],
      ["s:s1:2026-10-07", "18:00", true],
      ["e:e2", "20:00", false],
    ]);
  });

  it("weeks across the DST change keep the weekday", () => {
    const occ = expandPlans([series({ weekday: 6, startDate: "2026-01-01" })], [], "2026-03-23", "2026-04-05");
    expect(occ.map((o) => o.date)).toEqual(["2026-03-29", "2026-04-05"]);
  });
});

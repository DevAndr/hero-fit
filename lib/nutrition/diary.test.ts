import { describe, expect, it } from "vitest";
import { balance, dayTotals, parseDiaryDate, ringArcs, weekSeries } from "./diary";

describe("dayTotals", () => {
  it("sums by meal and day; missing macros count as 0, grams to 0.1", () => {
    const t = dayTotals([
      { meal: "BREAKFAST", kcal: 300, protein: 10, fat: null, carbs: null },
      { meal: "BREAKFAST", kcal: 200, protein: null, fat: 5.55, carbs: null },
      { meal: "DINNER", kcal: 500, protein: null, fat: null, carbs: null },
    ]);
    expect(t.total).toEqual({ kcal: 1000, protein: 10, fat: 5.6, carbs: 0 });
    expect(t.byMeal.BREAKFAST.kcal).toBe(500);
    expect(t.byMeal.LUNCH).toEqual({ kcal: 0, protein: 0, fat: 0, carbs: 0 });
  });
});

describe("balance", () => {
  it("left while within the norm, over when above", () => {
    expect(balance(1450, 2760)).toEqual({ left: 1310 });
    expect(balance(2760, 2760)).toEqual({ left: 0 });
    expect(balance(2880, 2760)).toEqual({ over: 120 });
  });
});

describe("parseDiaryDate", () => {
  const today = "2026-10-31";
  it("a valid past date stays", () => {
    expect(parseDiaryDate("2026-10-30", today)).toBe("2026-10-30");
  });
  it("garbage, arrays, impossible and future dates → today", () => {
    for (const raw of [undefined, "abc", ["x"], "2026-02-30", "2026-11-01"]) expect(parseDiaryDate(raw, today)).toBe(today);
  });
  it("older than a year → the year boundary", () => {
    expect(parseDiaryDate("2025-01-01", today)).toBe("2025-10-31");
  });
});

describe("ringArcs", () => {
  it("main arc is the eaten share of the norm, over arc is the excess, both capped at a full circle", () => {
    expect(ringArcs(0, 2000)).toEqual({ main: 0, over: 0 });
    expect(ringArcs(500, 2000)).toEqual({ main: 0.25, over: 0 });
    expect(ringArcs(2000, 2000)).toEqual({ main: 1, over: 0 });
    expect(ringArcs(2200, 2000)).toEqual({ main: 1, over: 0.1 });
    expect(ringArcs(5000, 2000)).toEqual({ main: 1, over: 1 });
  });
  it("no norm → empty ring", () => {
    expect(ringArcs(500, 0)).toEqual({ main: 0, over: 0 });
  });
});

describe("weekSeries", () => {
  const today = "2026-11-03";
  it("fills 7 days up to today, empty days are 0", () => {
    const { days } = weekSeries([{ date: "2026-11-01", kcal: 1800 }], today, null);
    expect(days.map((d) => d.date)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(days.map((d) => d.kcal)).toEqual([0, 0, 0, 0, 1800, 0, 0]);
  });
  it("averages only days with entries, rounded; none — null", () => {
    expect(weekSeries([{ date: "2026-11-01", kcal: 1800 }, { date: "2026-11-02", kcal: 2001 }], today, null).avg).toBe(1901);
    expect(weekSeries([], today, 2000).avg).toBeNull();
  });
  it("in-norm days are within ±10 % of the norm; without a norm — 0", () => {
    const rows = [
      { date: "2026-10-30", kcal: 1800 },
      { date: "2026-10-31", kcal: 2200 },
      { date: "2026-11-01", kcal: 1799 },
      { date: "2026-11-02", kcal: 2201 },
    ];
    expect(weekSeries(rows, today, 2000).inNorm).toBe(2);
    expect(weekSeries(rows, today, null).inNorm).toBe(0);
  });
  it("ignores rows outside the week", () => {
    expect(weekSeries([{ date: "2026-10-27", kcal: 2000 }], today, 2000)).toMatchObject({ avg: null, inNorm: 0 });
  });
});

import { describe, expect, it } from "vitest";
import { balance, dayTotals, defaultMeal, parseDiaryDate } from "./diary";

describe("defaultMeal", () => {
  it("by local hour: breakfast before 11, lunch before 16, dinner before 21, then snack", () => {
    expect([3, 10, 11, 15, 16, 20, 21, 23].map(defaultMeal)).toEqual(["BREAKFAST", "BREAKFAST", "LUNCH", "LUNCH", "DINNER", "DINNER", "SNACK", "SNACK"]);
  });
});

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

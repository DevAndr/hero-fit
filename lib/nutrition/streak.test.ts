import { describe, expect, it } from "vitest";
import { diaryStreak, normDays } from "./streak";

const d = (...dates: string[]) => dates.map((date) => ({ date, kcal: 2000 }));

describe("diaryStreak", () => {
  const today = "2026-10-31";
  it("no days → nothing", () => {
    expect(diaryStreak([], today)).toEqual({ current: 0, longest: 0 });
  });
  it("today not counted yet does not break the streak", () => {
    expect(diaryStreak(d("2026-10-29", "2026-10-30"), today)).toEqual({ current: 2, longest: 2 });
  });
  it("counts today", () => {
    expect(diaryStreak(d("2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"), today)).toEqual({ current: 4, longest: 4 });
  });
  it("a gap resets the current streak; longest stays", () => {
    expect(diaryStreak(d("2026-10-20", "2026-10-21", "2026-10-22", "2026-10-30", "2026-10-31"), today)).toEqual({ current: 2, longest: 3 });
  });
  it("last counted day the day before yesterday → current 0", () => {
    expect(diaryStreak(d("2026-10-28", "2026-10-29"), today)).toEqual({ current: 0, longest: 2 });
  });
  it("across a month boundary, in any order", () => {
    expect(diaryStreak(d("2026-10-02", "2026-09-30", "2026-10-01"), "2026-10-02")).toEqual({ current: 3, longest: 3 });
  });
});

describe("normDays", () => {
  const days = [1799, 1800, 2000, 2200, 2201].map((kcal, i) => ({ date: `2026-10-0${i + 1}`, kcal }));
  it("days within ±10 % of the norm", () => {
    expect(normDays(days, 2000)).toBe(3);
  });
  it("no norm → 0", () => {
    expect(normDays(days, null)).toBe(0);
  });
});

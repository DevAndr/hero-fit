import { describe, expect, it } from "vitest";
import { lastDays } from "./series";

describe("lastDays", () => {
  it("returns N consecutive days ending today, filling gaps with zeros", () => {
    const rows = [
      { day: "2026-10-04", volume: 1200, workouts: 1 },
      { day: "2026-10-06", volume: 800, workouts: 2 },
    ];
    expect(lastDays(rows, "2026-10-06", 4)).toEqual([
      { day: "2026-10-03", volume: 0, workouts: 0 },
      { day: "2026-10-04", volume: 1200, workouts: 1 },
      { day: "2026-10-05", volume: 0, workouts: 0 },
      { day: "2026-10-06", volume: 800, workouts: 2 },
    ]);
  });

  it("crosses month boundaries and ignores rows outside the range", () => {
    const days = lastDays([{ day: "2026-09-01", volume: 5, workouts: 1 }], "2026-10-01", 2);
    expect(days.map((d) => d.day)).toEqual(["2026-09-30", "2026-10-01"]);
    expect(days.every((d) => d.volume === 0)).toBe(true);
  });
});

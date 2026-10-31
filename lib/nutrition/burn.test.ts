import { describe, expect, it } from "vitest";
import { weightOn, workoutKcal } from "./burn";

describe("workoutKcal", () => {
  it("MET × weight × hours, rounded to 5", () => {
    expect(workoutKcal({ kinds: ["REPS", "REPS", "REPS"], durationSec: 3600, weightKg: 80, whoopKcal: null })).toEqual({ kcal: 400, source: "met" });
  });

  it("mixed workout: average MET over completed sets", () => {
    expect(workoutKcal({ kinds: ["REPS", "CARDIO"], durationSec: 1800, weightKg: 70, whoopKcal: null })).toEqual({ kcal: 210, source: "met" });
  });

  it("WHOOP wins, even without body weight", () => {
    expect(workoutKcal({ kinds: [], durationSec: null, weightKg: null, whoopKcal: 512 })).toEqual({ kcal: 512, source: "whoop" });
  });

  it("no sets, weight or duration → null", () => {
    expect(workoutKcal({ kinds: [], durationSec: 3600, weightKg: 80, whoopKcal: null })).toBeNull();
    expect(workoutKcal({ kinds: ["REPS"], durationSec: 3600, weightKg: null, whoopKcal: null })).toBeNull();
    expect(workoutKcal({ kinds: ["REPS"], durationSec: null, weightKg: 80, whoopKcal: null })).toBeNull();
    expect(workoutKcal({ kinds: ["REPS"], durationSec: 0, weightKg: 80, whoopKcal: null })).toBeNull();
  });
});

describe("weightOn", () => {
  const log = [
    { date: "2026-10-01", weight: 80 },
    { date: "2026-10-10", weight: 78 },
  ];
  it("last entry on or before the date, otherwise the earliest", () => {
    expect(weightOn(log, "2026-10-05")).toBe(80);
    expect(weightOn(log, "2026-10-10")).toBe(78);
    expect(weightOn(log, "2026-10-20")).toBe(78);
    expect(weightOn(log, "2026-09-01")).toBe(80);
    expect(weightOn([], "2026-10-05")).toBeNull();
  });
});

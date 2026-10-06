import { describe, expect, it } from "vitest";
import { workoutDraftSchema, workoutTotals } from "./schema";

const done = "2026-10-06T10:00:00.000Z";

describe("workoutDraftSchema", () => {
  it("accepts a valid draft and defaults isWarmup", () => {
    const r = workoutDraftSchema.parse({
      name: " Push ",
      exercises: [{ exerciseId: "e1", restSec: 90, sets: [{ weight: 100, reps: 5, completedAt: null }] }],
    });
    expect(r.name).toBe("Push");
    expect(r.exercises[0].sets[0]).toEqual({ weight: 100, reps: 5, isWarmup: false, completedAt: null });
  });

  it("coerces garbage numbers in sets to 0 instead of failing autosave", () => {
    const r = workoutDraftSchema.parse({
      name: "X",
      exercises: [{ exerciseId: "e1", restSec: 60, sets: [{ weight: -5, reps: 2.5, completedAt: null }] }],
    });
    expect(r.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 0 });
  });

  it("rejects too many exercises and bad rest", () => {
    const many = Array.from({ length: 31 }, () => ({ exerciseId: "e", restSec: 60, sets: [] }));
    expect(workoutDraftSchema.safeParse({ name: "X", exercises: many }).success).toBe(false);
    expect(
      workoutDraftSchema.safeParse({ name: "X", exercises: [{ exerciseId: "e", restSec: 9999, sets: [] }] }).success,
    ).toBe(false);
  });
});

describe("workoutTotals", () => {
  it("counts only completed working sets", () => {
    const totals = workoutTotals([
      {
        sets: [
          { weight: 40, reps: 10, isWarmup: true, completedAt: done },
          { weight: 100, reps: 5, completedAt: done },
          { weight: 100, reps: 5, completedAt: done },
          { weight: 100, reps: 5, completedAt: null },
        ],
      },
      { sets: [{ weight: 0, reps: 12, completedAt: done }] },
      { sets: [{ weight: 50, reps: 10, completedAt: null }] },
    ]);
    expect(totals).toEqual({ sets: 3, reps: 22, volume: 1000, exercises: 2 });
  });
});

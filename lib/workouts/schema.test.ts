import { describe, expect, it } from "vitest";
import { clampClientTime, workoutDraftSchema, workoutTotals } from "./schema";

const done = "2026-10-06T10:00:00.000Z";

describe("workoutDraftSchema", () => {
  it("accepts a valid draft and defaults isWarmup", () => {
    const r = workoutDraftSchema.parse({
      name: " Push ",
      exercises: [{ exerciseId: "e1", restSec: 90, sets: [{ weight: 100, reps: 5, completedAt: null }] }],
    });
    expect(r.name).toBe("Push");
    expect(r.exercises[0].sets[0]).toEqual({ weight: 100, reps: 5, isWarmup: false, rir: null, completedAt: null });
  });

  it("coerces garbage numbers in sets to 0 instead of failing autosave", () => {
    const r = workoutDraftSchema.parse({
      name: "X",
      exercises: [{ exerciseId: "e1", restSec: 60, sets: [{ weight: -5, reps: 2.5, completedAt: null }] }],
    });
    expect(r.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 0 });
  });

  it("keeps RIR 0–4, drops anything else to «not set»", () => {
    const parse = (rir: unknown) =>
      workoutDraftSchema.parse({
        name: "X",
        exercises: [{ exerciseId: "e1", restSec: 60, sets: [{ weight: 100, reps: 5, rir, completedAt: null }] }],
      }).exercises[0].sets[0].rir;
    expect([parse(0), parse(4), parse(null)]).toEqual([0, 4, null]);
    expect([parse(7), parse(-1), parse(1.5), parse("2")]).toEqual([null, null, null, null]);
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

describe("clampClientTime", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const H = 3600 * 1000;
  it("keeps a sane device time, clamps the future, too old and before min", () => {
    expect(clampClientTime("2026-10-07T11:30:00Z", now, null, 12 * H)).toEqual(new Date("2026-10-07T11:30:00Z"));
    expect(clampClientTime("2026-10-07T13:00:00Z", now, null, 12 * H)).toEqual(now);
    expect(clampClientTime("2026-10-06T10:00:00Z", now, null, 12 * H)).toEqual(new Date("2026-10-07T00:00:00Z"));
    const started = new Date("2026-10-07T11:00:00Z");
    expect(clampClientTime("2026-10-07T10:00:00Z", now, started, 24 * H)).toEqual(started);
  });
  it("falls back to now for missing or invalid input", () => {
    expect(clampClientTime(undefined, now, null, H)).toEqual(now);
    expect(clampClientTime("garbage", now, null, H)).toEqual(now);
  });
});

describe("workoutDraftSchema — superset group", () => {
  it("an old draft without group reads as no group; garbage — no group", () => {
    const old = workoutDraftSchema.parse({ name: "X", exercises: [{ exerciseId: "e1", restSec: 60, sets: [] }] });
    expect(old.exercises[0].group).toBeNull();
    const bad = workoutDraftSchema.parse({ name: "X", exercises: [{ exerciseId: "e1", restSec: 60, group: "x", sets: [] }] });
    expect(bad.exercises[0].group).toBeNull();
    const ok = workoutDraftSchema.parse({ name: "X", exercises: [{ exerciseId: "e1", restSec: 60, group: 2, sets: [] }] });
    expect(ok.exercises[0].group).toBe(2);
  });
});

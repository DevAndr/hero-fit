import { describe, expect, it } from "vitest";
import { PR_XP, stretchSessionXp, workoutXp } from "./xp";

describe("workoutXp", () => {
  it("is 0 for a workout without completed sets", () => {
    expect(workoutXp({ sets: 0, reps: 0, volume: 0 })).toBe(0);
  });

  it("grows with sets, reps and volume", () => {
    // 50 база + 10 подходов × 5 + 80 повторов / 5 + 4000 кг / 200
    expect(workoutXp({ sets: 10, reps: 80, volume: 4000 })).toBe(50 + 50 + 16 + 20);
  });

  it("bodyweight workout still earns XP via reps", () => {
    expect(workoutXp({ sets: 4, reps: 40, volume: 0 })).toBe(50 + 20 + 8);
  });

  it("is capped to prevent farming", () => {
    expect(workoutXp({ sets: 500, reps: 5000, volume: 1_000_000 })).toBe(600);
  });

  it("PR bonus is a positive constant", () => {
    expect(PR_XP).toBeGreaterThan(0);
  });
});

describe("workoutXp — minutes of timed and cardio work", () => {
  it("adds a point per full minute, keeps the cap", () => {
    expect(workoutXp({ sets: 1, reps: 0, volume: 0, workSec: 1800 })).toBe(85);
    expect(workoutXp({ sets: 1, reps: 0, volume: 0, workSec: 59 })).toBe(55);
    expect(workoutXp({ sets: 10, reps: 0, volume: 0, workSec: 60 * 1000 })).toBe(600);
  });
});

describe("stretching XP", () => {
  it("stretch session: 15 + a point per full minute of holds, max 60", () => {
    expect(stretchSessionXp(0)).toBe(15);
    expect(stretchSessionXp(600)).toBe(25);
    expect(stretchSessionXp(659)).toBe(25);
    expect(stretchSessionXp(3600)).toBe(60);
  });

  it("stretching inside a strength workout adds a point per minute", () => {
    const before = workoutXp({ sets: 4, reps: 40, volume: 2000 });
    expect(workoutXp({ sets: 4, reps: 40, volume: 2000, stretchSec: 300 })).toBe(before + 5);
    expect(workoutXp({ sets: 500, reps: 5000, volume: 1_000_000, stretchSec: 6000 })).toBe(600);
  });
});

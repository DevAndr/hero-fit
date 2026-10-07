import { describe, expect, it } from "vitest";
import { platesFor, warmupSets } from "./plates";

describe("platesFor", () => {
  it("loads each side greedily from the heaviest plate", () => {
    expect(platesFor(100)).toEqual({ perSide: [25, 15], total: 100, exact: true });
    expect(platesFor(102.5)).toEqual({ perSide: [25, 15, 1.25], total: 102.5, exact: true });
    expect(platesFor(142.5)).toEqual({ perSide: [25, 25, 10, 1.25], total: 142.5, exact: true });
  });

  it("nothing to load at or below the bar", () => {
    expect(platesFor(20)).toBeNull();
    expect(platesFor(15)).toBeNull();
  });

  it("closest lower weight when the target can't be made exactly", () => {
    expect(platesFor(101)).toEqual({ perSide: [25, 15], total: 100, exact: false });
  });

  it("custom bar", () => {
    expect(platesFor(60, 15)).toEqual({ perSide: [20, 2.5], total: 60, exact: true });
  });
});

describe("warmupSets", () => {
  it("bar × 10, then 40/60/80 % rounded down to 2.5 kg", () => {
    expect(warmupSets(100)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
    expect(warmupSets(102.5)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });

  it("skips steps that don't climb above the bar or the previous step", () => {
    // 40 % от 50 = 20 (= гриф) — пропуск
    expect(warmupSets(50)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 30, reps: 3 },
      { weight: 40, reps: 2 },
    ]);
  });

  it("light working weights need no warm-up sets", () => {
    expect(warmupSets(35)).toEqual([]);
    expect(warmupSets(0)).toEqual([]);
  });
});

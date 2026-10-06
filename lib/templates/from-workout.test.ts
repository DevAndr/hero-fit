import { describe, expect, it } from "vitest";
import { differsFromTemplate, templateItemsFromWorkout } from "./from-workout";

const set = (isWarmup = false) => ({ isWarmup });

describe("differsFromTemplate", () => {
  const template = [
    { exerciseId: "a", targetSets: 2 },
    { exerciseId: "b", targetSets: 3 },
  ];

  it("same exercises, order and working set count → no difference (warmups ignored)", () => {
    expect(
      differsFromTemplate(
        [
          { exerciseId: "a", sets: [set(true), set(), set()] },
          { exerciseId: "b", sets: [set(), set(), set()] },
        ],
        template,
      ),
    ).toBe(false);
  });

  it("added exercise, reordering or different set count → differs", () => {
    const a = { exerciseId: "a", sets: [set(), set()] };
    const b = { exerciseId: "b", sets: [set(), set(), set()] };
    expect(differsFromTemplate([a, b, { exerciseId: "c", sets: [set()] }], template)).toBe(true);
    expect(differsFromTemplate([b, a], template)).toBe(true);
    expect(differsFromTemplate([a, { ...b, sets: [set()] }], template)).toBe(true);
  });
});

describe("templateItemsFromWorkout", () => {
  it("uses working set count and last set as targets", () => {
    expect(
      templateItemsFromWorkout([
        { exerciseId: "a", restSec: 90, sets: [{ weight: 60, reps: 10 }, { weight: 70, reps: 8 }] },
        { exerciseId: "b", restSec: 60, sets: [{ weight: 0, reps: 12 }] },
      ]),
    ).toEqual([
      { exerciseId: "a", order: 0, restSec: 90, targetSets: 2, targetReps: 8, targetWeight: 70 },
      { exerciseId: "b", order: 1, restSec: 60, targetSets: 1, targetReps: 12, targetWeight: null },
    ]);
  });
});

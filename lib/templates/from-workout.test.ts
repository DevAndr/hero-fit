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
      { exerciseId: "a", order: 0, restSec: 90, targetSets: 2, targetReps: 8, targetWeight: 70, supersetGroup: null },
      { exerciseId: "b", order: 1, restSec: 60, targetSets: 1, targetReps: 12, targetWeight: null, supersetGroup: null },
    ]);
  });
});

describe("supersets in templates", () => {
  const s = { weight: 50, reps: 10 };
  it("templateItemsFromWorkout carries normalized groups", () => {
    const items = templateItemsFromWorkout([
      { exerciseId: "a", restSec: 60, supersetGroup: 3, sets: [s] },
      { exerciseId: "b", restSec: 60, supersetGroup: 3, sets: [s] },
      { exerciseId: "c", restSec: 60, supersetGroup: 5, sets: [s] },
    ]);
    expect(items.map((i) => i.supersetGroup)).toEqual([1, 1, null]);
  });

  it("differsFromTemplate notices a different grouping", () => {
    const w = [
      { exerciseId: "a", supersetGroup: 1, sets: [{ isWarmup: false }] },
      { exerciseId: "b", supersetGroup: 1, sets: [{ isWarmup: false }] },
    ];
    const t = [
      { exerciseId: "a", targetSets: 1, supersetGroup: null },
      { exerciseId: "b", targetSets: 1, supersetGroup: null },
    ];
    expect(differsFromTemplate(w, t)).toBe(true);
    expect(differsFromTemplate(w, t.map((x) => ({ ...x, supersetGroup: 1 })))).toBe(false);
  });
});

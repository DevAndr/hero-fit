import { describe, expect, it } from "vitest";
import { bestOfSets, epley1RM, findNewRecords } from "./records";

describe("epley1RM", () => {
  it("uses Epley formula weight × (1 + reps/30)", () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.67, 2);
    expect(epley1RM(60, 10)).toBe(80);
  });

  it("single rep equals the weight; no weight or reps → 0", () => {
    expect(epley1RM(140, 1)).toBe(140);
    expect(epley1RM(0, 10)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
  });
});

describe("bestOfSets", () => {
  it("takes max weight, max reps and best 1RM independently", () => {
    const best = bestOfSets([
      { weight: 100, reps: 5 },
      { weight: 110, reps: 2 },
      { weight: 60, reps: 15 },
    ]);
    expect(best.MAX_WEIGHT).toBe(110);
    expect(best.MAX_REPS).toBe(15);
    expect(best.ONE_RM).toBeCloseTo(epley1RM(110, 2), 5); // 117.3 > 100×5 (116.7) > 60×15 (90)
  });

  it("bodyweight sets give only MAX_REPS", () => {
    expect(bestOfSets([{ weight: 0, reps: 12 }])).toEqual({ MAX_REPS: 12 });
  });

  it("empty input → no records", () => {
    expect(bestOfSets([])).toEqual({});
  });
});

describe("findNewRecords", () => {
  it("reports improvements over previous records, first-time records are silent", () => {
    const r = findNewRecords({ MAX_WEIGHT: 110, MAX_REPS: 8, ONE_RM: 120 }, { MAX_WEIGHT: 100, MAX_REPS: 8 });
    expect(r.improved).toEqual([{ type: "MAX_WEIGHT", value: 110, previous: 100 }]);
    expect(r.firstTime).toEqual([{ type: "ONE_RM", value: 120 }]);
  });
});

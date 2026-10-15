import { describe, expect, it } from "vitest";
import { bestOfSets, epley1RM, findNewRecords, formatRecord } from "./records";

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

describe("records of timed and cardio exercises", () => {
  it("TIME — longest hold only", () => {
    expect(bestOfSets([{ weight: 0, reps: 0, durationSec: 60 }, { weight: 0, reps: 0, durationSec: 95 }], "TIME")).toEqual({ MAX_DURATION: 95 });
  });

  it("CARDIO — distance, duration and pace from 1 km", () => {
    const best = bestOfSets(
      [
        { weight: 0, reps: 0, durationSec: 1720, distanceM: 5200 },
        { weight: 0, reps: 0, durationSec: 200, distanceM: 800 },
      ],
      "CARDIO",
    );
    expect(Object.keys(best).sort()).toEqual(["BEST_PACE", "MAX_DISTANCE", "MAX_DURATION"]);
    expect(best.MAX_DISTANCE).toBe(5200);
    expect(best.MAX_DURATION).toBe(1720);
    expect(best.BEST_PACE).toBeCloseTo(330.77, 2);
  });

  it("a short cardio set sets no pace", () => {
    expect(bestOfSets([{ weight: 0, reps: 0, durationSec: 200, distanceM: 800 }], "CARDIO")).toEqual({ MAX_DISTANCE: 800, MAX_DURATION: 200 });
  });

  it("pace: lower is better", () => {
    expect(findNewRecords({ BEST_PACE: 300 }, { BEST_PACE: 330 }).improved).toEqual([{ type: "BEST_PACE", value: 300, previous: 330 }]);
    expect(findNewRecords({ BEST_PACE: 340 }, { BEST_PACE: 330 }).improved).toEqual([]);
  });

  it("formatRecord", () => {
    expect(formatRecord("MAX_DURATION", 95)).toBe("1:35");
    expect(formatRecord("MAX_DISTANCE", 5200)).toBe("5,2 км");
    expect(formatRecord("BEST_PACE", 330.77)).toBe("5:31/км");
    expect(formatRecord("MAX_WEIGHT", 102.5)).toBe("102,5 кг");
    expect(formatRecord("MAX_REPS", 12)).toBe("12");
  });
});

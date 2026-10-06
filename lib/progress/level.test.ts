import { describe, expect, it } from "vitest";
import { levelProgress, xpToNextLevel } from "./level";

describe("xpToNextLevel", () => {
  it("costs 100 XP to go from level 1 to 2", () => {
    expect(xpToNextLevel(1)).toBe(100);
  });

  it("grows with level and is rounded to tens", () => {
    let prev = 0;
    for (let level = 1; level <= 50; level++) {
      const cost = xpToNextLevel(level);
      expect(cost).toBeGreaterThan(prev);
      expect(cost % 10).toBe(0);
      prev = cost;
    }
  });
});

describe("levelProgress", () => {
  it("starts at level 1 with empty bar", () => {
    expect(levelProgress(0)).toEqual({ level: 1, current: 0, required: 100, percent: 0 });
  });

  it("stays on level 1 just below the threshold", () => {
    expect(levelProgress(99)).toMatchObject({ level: 1, current: 99, required: 100, percent: 99 });
  });

  it("reaches level 2 exactly at 100 XP", () => {
    expect(levelProgress(100)).toMatchObject({ level: 2, current: 0, required: xpToNextLevel(2) });
  });

  it("carries the remainder into the next level", () => {
    const xp = xpToNextLevel(1) + xpToNextLevel(2) + 15;
    expect(levelProgress(xp)).toMatchObject({ level: 3, current: 15 });
  });

  it("treats negative or fractional XP safely", () => {
    expect(levelProgress(-50).level).toBe(1);
    expect(levelProgress(150.7).current).toBe(50);
  });
});

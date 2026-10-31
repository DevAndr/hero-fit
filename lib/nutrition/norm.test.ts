import { describe, expect, it } from "vitest";
import { dailyNorm } from "./norm";

const man = { gender: "MALE", birthYear: 1996, heightCm: 180, weightKg: 80, activity: "MODERATE", goal: "MAINTAIN" } as const;

describe("dailyNorm", () => {
  it("Mifflin–St Jeor × activity for a man, macros from body weight", () => {
    expect(dailyNorm(man, 2026)).toEqual({ kcal: 2760, protein: 144, fat: 72, carbs: 384, bmr: 1780, factor: 1.55, goalPct: 0 });
  });

  it("women: −161 instead of +5", () => {
    expect(dailyNorm({ ...man, gender: "FEMALE" }, 2026)).toMatchObject({ bmr: 1614, kcal: 2500 });
  });

  it("goal: lose −15 % with more protein, gain +10 %", () => {
    expect(dailyNorm({ ...man, goal: "LOSE" }, 2026)).toMatchObject({ kcal: 2350, protein: 160, goalPct: -15 });
    expect(dailyNorm({ ...man, goal: "GAIN" }, 2026)).toMatchObject({ kcal: 3030, goalPct: 10 });
  });

  it("never below 1200 kcal for women and 1500 for men", () => {
    const small = { gender: "FEMALE", birthYear: 1956, heightCm: 150, weightKg: 45, activity: "SEDENTARY", goal: "LOSE" } as const;
    expect(dailyNorm(small, 2026)?.kcal).toBe(1200);
    expect(dailyNorm({ ...small, gender: "MALE" }, 2026)?.kcal).toBe(1500);
  });

  it("carbs never go negative", () => {
    const heavy = { gender: "FEMALE", birthYear: 1950, heightCm: 150, weightKg: 150, activity: "SEDENTARY", goal: "LOSE" } as const;
    expect(dailyNorm(heavy, 2026)!.carbs).toBeGreaterThanOrEqual(0);
  });

  it("any missing field → null", () => {
    for (const key of ["gender", "birthYear", "heightCm", "weightKg", "activity", "goal"] as const) {
      expect(dailyNorm({ ...man, [key]: null }, 2026)).toBeNull();
    }
  });
});

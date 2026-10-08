import { describe, expect, it } from "vitest";
import { bossHp, rewardXp, setDamage, workoutDamage } from "./damage";

describe("setDamage", () => {
  it("рабочий подход — 100, до отказа (RIR 0–1) — 150", () => {
    expect(setDamage(null)).toBe(100);
    expect(setDamage(2)).toBe(100);
    expect(setDamage(1)).toBe(150);
    expect(setDamage(0)).toBe(150);
  });
});

describe("workoutDamage", () => {
  it("сумма подходов + 100 за каждое упражнение с рекордом", () => {
    expect(workoutDamage([{ rir: null }, { rir: 0 }, { rir: 3 }], 2)).toEqual({ damage: 550, crits: 2 });
  });
});

describe("bossHp", () => {
  it("минимум 1500", () => {
    expect(bossHp([])).toBe(1500);
    expect(bossHp([1000, 0, 1200])).toBe(1500); // 1100 × 1,1 = 1210 < минимума
  });

  it("среднее первых 4 ненулевых недель × 1,1, до сотни", () => {
    expect(bossHp([2000, 0, 2400, 1600, 2000, 9000])).toBe(2200);
    expect(bossHp([2050])).toBe(2300); // 2255 → 2300
  });
});

describe("rewardXp", () => {
  it("HP / 20", () => {
    expect(rewardXp(1500)).toBe(75);
    expect(rewardXp(2300)).toBe(115);
  });
});

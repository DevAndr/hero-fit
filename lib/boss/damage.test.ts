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
  const w = (damage: number, workouts: number) => ({ damage, workouts });

  it("минимум 3000", () => {
    expect(bossHp([])).toBe(3000);
    expect(bossHp([w(700, 1), w(0, 0), w(800, 1)])).toBe(3000); // тренировка 750 × 3 × 1,1 = 2475 < минимума
  });

  it("не меньше трёх средних тренировок × 1,1: одной тренировкой не победить", () => {
    // по одной тренировке в неделю на 2000 → 2000 × 3 × 1,1 = 6600
    expect(bossHp([w(2000, 1), w(2000, 1)])).toBe(6600);
    // 2 тренировки по 1500 → неделя 3000, тренировка 1500 × 3 × 1,1 = 4950 → 5000
    expect(bossHp([w(3000, 2)])).toBe(5000);
  });

  it("частые тренировки: среднее первых 4 ненулевых недель × 1,1, до сотни", () => {
    // 5 тренировок по 1600 = 8000 в неделю → 8800 (три тренировки — 5280, меньше)
    expect(bossHp([w(8000, 5), w(0, 0), w(8000, 5), w(8000, 5), w(8000, 5), w(90000, 1)])).toBe(8800);
    expect(bossHp([w(8200, 4)])).toBe(9000); // 9020 → 9000; тренировка 2050 × 3,3 = 6765
  });
});

describe("rewardXp", () => {
  it("HP / 20", () => {
    expect(rewardXp(3000)).toBe(150);
    expect(rewardXp(2300)).toBe(115);
  });
});

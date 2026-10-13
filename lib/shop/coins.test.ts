import { describe, expect, it } from "vitest";
import { achievementCoins, levelCoins, levelUpCoins, recordCoins, streakWeekCoins, workoutCoins } from "./coins";

describe("ставки монет", () => {
  it("тренировка: от 3 рабочих подходов, не больше 2 в день", () => {
    expect(workoutCoins(3, 0)).toBe(10);
    expect(workoutCoins(2, 0)).toBe(0);
    expect(workoutCoins(5, 1)).toBe(10);
    expect(workoutCoins(5, 2)).toBe(0);
  });
  it("рекорды: 5 за упражнение, до 3 на тренировку", () => {
    expect(recordCoins(0)).toBe(0);
    expect(recordCoins(2)).toBe(10);
    expect(recordCoins(7)).toBe(15);
  });
  it("ачивка: XP / 5 в пределах 3…50", () => {
    expect(achievementCoins(5)).toBe(3);
    expect(achievementCoins(60)).toBe(12);
    expect(achievementCoins(1000)).toBe(50);
  });
  it("неделя серии: 10 + 2 × серия, не больше 30", () => {
    expect(streakWeekCoins(1)).toBe(12);
    expect(streakWeekCoins(10)).toBe(30);
  });
  it("уровни", () => {
    expect(levelCoins(5)).toBe(30);
    expect(levelUpCoins(3, 5)).toEqual([
      { level: 4, amount: 28 },
      { level: 5, amount: 30 },
    ]);
    expect(levelUpCoins(5, 5)).toEqual([]);
  });
});

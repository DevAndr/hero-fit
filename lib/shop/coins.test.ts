import { describe, expect, it } from "vitest";
import { xpToNextLevel } from "@/lib/progress/level";
import { achievementCoins, levelCoins, levelUpCoins, levelUpGrants, recordCoins, streakWeekCoins, workoutCoins, workoutCoinGrants } from "./coins";

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

describe("начисление за тренировку", () => {
  const base = {
    workoutId: "w1",
    day: "2030-01-10",
    workingSets: 3,
    paidToday: 0,
    records: [] as { exerciseId: string; exerciseName: string }[],
    streakWeek: null as string | null,
    streak: 1,
    levelBefore: 1,
    levelAfter: 1,
  };
  it("тренировка и рекорды — ключи по формату", () => {
    const g = workoutCoinGrants({ ...base, records: [{ exerciseId: "e1", exerciseName: "Жим" }], streakWeek: "2030-01-07", streak: 2, levelBefore: 2, levelAfter: 3 });
    expect(g.map((x) => [x.reason, x.key, x.amount])).toEqual([
      ["WORKOUT", "workout:w1", 10],
      ["RECORD", "record:w1:e1", 5],
      ["STREAK_WEEK", "streakw:2030-01-07", 14],
      ["LEVEL_UP", "level:3", 26],
    ]);
    expect(g[0].meta).toEqual({ day: "2030-01-10" });
  });
  it("при paidToday 2 тренировка не оплачивается, рекорды — да", () => {
    const g = workoutCoinGrants({ ...base, paidToday: 2, records: [{ exerciseId: "e1", exerciseName: "Жим" }] });
    expect(g.some((x) => x.reason === "WORKOUT")).toBe(false);
    expect(g.some((x) => x.reason === "RECORD")).toBe(true);
  });
  it("без засчитанной недели нет STREAK_WEEK; рекордов не больше 3 и по разным упражнениям", () => {
    const records = ["a", "a", "b", "c", "d"].map((id) => ({ exerciseId: id, exerciseName: id }));
    const g = workoutCoinGrants({ ...base, records });
    expect(g.some((x) => x.reason === "STREAK_WEEK")).toBe(false);
    expect(g.filter((x) => x.reason === "RECORD").map((x) => x.key)).toEqual(["record:w1:a", "record:w1:b", "record:w1:c"]);
  });
});

describe("levelUpGrants", () => {
  it("переход 4 -> 6 даёт level:5 и level:6", () => {
    // XP на старте 4-го и 6-го уровней
    let xp4 = 0;
    for (let l = 1; l < 4; l++) xp4 += xpToNextLevel(l);
    const xp6 = xp4 + xpToNextLevel(4) + xpToNextLevel(5);
    expect(levelUpGrants(xp4, xp6).map((x) => [x.key, x.amount])).toEqual([
      ["level:5", 30],
      ["level:6", 32],
    ]);
    expect(levelUpGrants(xp4, xp4 + 1)).toEqual([]);
  });
});

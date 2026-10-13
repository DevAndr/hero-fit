import { describe, expect, it } from "vitest";
import { retroCoins } from "@/lib/shop/retro";

const empty = { workoutsPerDay: [], recordExercisesPerWorkout: [], achievementXp: [], level: 1 };

describe("retroCoins", () => {
  it("пустая история — 0", () => {
    expect(retroCoins(empty)).toBe(0);
  });
  it("день с 3 тренировками оплачивается как 2", () => {
    expect(retroCoins({ ...empty, workoutsPerDay: [{ day: "2026-01-01", workouts: 3 }] })).toBe(20);
  });
  it("рекорды: 5 упражнений в тренировке — до 3", () => {
    expect(retroCoins({ ...empty, recordExercisesPerWorkout: [5] })).toBe(15);
  });
  it("ачивки: минимум 3, максимум 50", () => {
    expect(retroCoins({ ...empty, achievementXp: [15, 1000] })).toBe(3 + 50);
  });
  it("уровни со 2-го по текущий", () => {
    expect(retroCoins({ ...empty, level: 3 })).toBe(24 + 26);
  });
  it("огромная история упирается в потолок", () => {
    expect(retroCoins({ ...empty, workoutsPerDay: [{ day: "d", workouts: 1 }], achievementXp: Array(1000).fill(1000), level: 500 })).toBe(3000);
  });
});

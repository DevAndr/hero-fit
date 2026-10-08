import { describe, expect, it } from "vitest";
import { chestReward, RARE_CHEST_CHANCE } from "./daily-chest";

/** Генератор, по очереди отдающий заданные значения: [бонус, редкость]. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("chestReward", () => {
  it("база растёт с серией входов: 5 в первый день, +1 за день, потолок 10", () => {
    expect(chestReward(1, seq(0, 0.99)).base).toBe(5);
    expect(chestReward(3, seq(0, 0.99)).base).toBe(7);
    expect(chestReward(6, seq(0, 0.99)).base).toBe(10);
    expect(chestReward(40, seq(0, 0.99)).base).toBe(10);
    expect(chestReward(0, seq(0, 0.99)).base).toBe(5);
  });

  it("случайный бонус 0…5", () => {
    expect(chestReward(1, seq(0, 0.99))).toMatchObject({ bonus: 0, amount: 5, rare: false });
    expect(chestReward(1, seq(0.999, 0.99))).toMatchObject({ bonus: 5, amount: 10, rare: false });
  });

  it("редкий сундук утраивает награду", () => {
    expect(chestReward(7, seq(0.999, 0))).toEqual({ base: 10, bonus: 5, rare: true, amount: 45 });
    expect(chestReward(1, seq(0, RARE_CHEST_CHANCE))).toMatchObject({ rare: false, amount: 5 });
  });
});

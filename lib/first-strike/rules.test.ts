import { describe, expect, it } from "vitest";
import {
  canStrike,
  FIRST_STRIKE_DAMAGE,
  FIRST_STRIKE_XP,
  parseStrike,
  STRIKE_EXERCISES,
} from "./rules";

describe("canStrike", () => {
  it("доступен новичку с флагом", () => {
    expect(canStrike({ flag: true, firstStrikeAt: null, completedWorkouts: 0 })).toBe(true);
  });
  it("закрыт без флага, после удара и после первой тренировки", () => {
    expect(canStrike({ flag: false, firstStrikeAt: null, completedWorkouts: 0 })).toBe(false);
    expect(canStrike({ flag: true, firstStrikeAt: new Date(), completedWorkouts: 0 })).toBe(false);
    expect(canStrike({ flag: true, firstStrikeAt: null, completedWorkouts: 1 })).toBe(false);
  });
});

describe("parseStrike", () => {
  it("принимает число и числовую строку", () => {
    expect(parseStrike("squat", 10)).toEqual({ ok: true, exercise: "squat", value: 10 });
    expect(parseStrike("pushup", "200")).toEqual({ ok: true, exercise: "pushup", value: 200 });
    expect(parseStrike("plank", 5)).toMatchObject({ ok: true });
  });
  it("отклоняет неверные значения", () => {
    for (const [e, v] of [
      ["squat", 0],
      ["squat", 201],
      ["squat", 1.5],
      ["squat", ""],
      ["plank", 4],
      ["plank", 601],
      ["burpee", 10],
      ["squat", null],
    ] as const)
      expect(parseStrike(e, v).ok).toBe(false);
  });
  it("тексты ошибок", () => {
    expect(parseStrike("squat", 0)).toEqual({ ok: false, error: "Повторов — от 1 до 200" });
    expect(parseStrike("plank", 4)).toEqual({ ok: false, error: "Секунд — от 5 до 600" });
    expect(parseStrike("burpee", 10)).toEqual({ ok: false, error: "Выберите упражнение" });
  });
});

describe("константы", () => {
  it("значения", () => {
    expect(FIRST_STRIKE_DAMAGE).toBe(100);
    expect(FIRST_STRIKE_XP).toBe(30);
    expect(STRIKE_EXERCISES.map((e) => [e.code, e.unit, e.defaultValue])).toEqual([
      ["squat", "reps", 10],
      ["pushup", "reps", 10],
      ["plank", "sec", 30],
    ]);
  });
});

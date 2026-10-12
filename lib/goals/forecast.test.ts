import { describe, expect, it } from "vitest";
import { forecastGoal, forecastShort, forecastText } from "./forecast";

const TODAY = "2026-10-12";
const pts = (...values: number[]) => {
  const weeks = ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].slice(-values.length);
  return values.map((value, i) => ({ week: weeks[i], value }));
};
const base = { points: pts(60, 62, 64), current: 64, target: 70, deadline: null, today: TODAY };

describe("forecastGoal", () => {
  it("мало данных — нет прогноза", () => {
    expect(forecastGoal({ ...base, points: pts(60, 62) })).toBeNull();
    expect(forecastGoal({ ...base, points: [60, 62, 64].map((value) => ({ week: "2026-10-05", value })) })).toBeNull();
  });

  it("без срока — дата по темпу", () => {
    expect(forecastGoal(base)).toEqual({ kind: "eta", date: "2026-11-02" });
  });

  it("со сроком — успеваешь / не успеваешь", () => {
    expect(forecastGoal({ ...base, deadline: "2026-11-09" })).toEqual({ kind: "onTrack", date: "2026-11-02" });
    expect(forecastGoal({ ...base, deadline: "2026-10-19" })).toEqual({ kind: "late", date: "2026-11-02", need: 6, pace: 2 });
  });

  it("срок сегодня — без деления на ноль", () => {
    const f = forecastGoal({ ...base, deadline: TODAY });
    expect(f?.kind).toBe("late");
    expect(f && "need" in f && Number.isFinite(f.need)).toBe(true);
  });

  it("нет роста или движение от цели — stalled", () => {
    expect(forecastGoal({ ...base, points: pts(64, 64, 64) })).toEqual({ kind: "stalled" });
    expect(forecastGoal({ ...base, points: pts(64, 62, 60), current: 60 })).toEqual({ kind: "stalled" });
  });

  it("вес тела вниз к цели — дата, не stalled", () => {
    expect(forecastGoal({ ...base, points: pts(90, 89, 88), current: 88, target: 85 })).toEqual({ kind: "eta", date: "2026-11-02" });
  });

  it("слишком медленно — больше 2 лет", () => {
    expect(forecastGoal({ ...base, points: pts(64, 64.01, 64.02), target: 114 })).toEqual({ kind: "far" });
  });
});

describe("тексты прогноза", () => {
  const kg = { unit: "кг" as const, bodyWeight: false, today: TODAY };
  it("полный", () => {
    expect(forecastText({ kind: "onTrack", date: "2026-11-14" }, kg)).toBe("Успеваешь: ≈ 14 ноября");
    expect(forecastText({ kind: "eta", date: "2026-11-14" }, kg)).toBe("≈ 14 ноября");
    expect(forecastText({ kind: "eta", date: "2027-02-01" }, kg)).toBe("≈ 1 февраля 2027");
    expect(forecastText({ kind: "late", date: "2026-12-01", need: 1.2, pace: 0.5 }, kg)).toBe(
      "Не успеваешь к сроку: нужно +1,2 кг в неделю, сейчас +0,5",
    );
    expect(forecastText({ kind: "late", date: "2026-12-01", need: -1, pace: -0.5 }, { unit: "кг", bodyWeight: true, today: TODAY })).toBe(
      "Не успеваешь к сроку: нужно −1 кг в неделю, сейчас −0,5",
    );
    expect(forecastText({ kind: "late", date: "2026-12-01", need: 2, pace: 1 }, { unit: "повт.", bodyWeight: false, today: TODAY })).toBe(
      "Не успеваешь к сроку: нужно +2 повт. в неделю, сейчас +1",
    );
    expect(forecastText({ kind: "stalled" }, kg)).toBe("Пока без роста — прогноз появится, когда пойдёт прогресс");
    expect(forecastText({ kind: "stalled" }, { unit: "кг", bodyWeight: true, today: TODAY })).toBe("Вес пока не движется к цели");
    expect(forecastText({ kind: "far" }, kg)).toBe("Больше 2 лет при текущем темпе");
  });

  it("короткий", () => {
    expect(forecastShort({ kind: "onTrack", date: "2026-11-14" }, TODAY)).toBe("≈ 14 ноября");
    expect(forecastShort({ kind: "late", date: "2026-12-01", need: 1, pace: 0.5 }, TODAY)).toBe("не успеваешь к сроку");
  });
});

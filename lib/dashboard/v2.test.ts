import { describe, expect, it } from "vitest";
import { balanceSlices, weekCompare, weekHeadline, weekStrip } from "./v2";

describe("weekStrip", () => {
  it("неделя с понедельника; сегодня в среду", () => {
    const s = weekStrip({ today: "2026-10-22", workoutDays: ["2026-10-20", "2026-10-22"], plannedDays: ["2026-10-24"] });
    expect(s.map((d) => d.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(s.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(s[1]).toMatchObject({ done: true, past: true });
    expect(s[3]).toMatchObject({ done: true, today: true, past: false });
    expect(s[5]).toMatchObject({ planned: true, past: false, done: false });
  });

  it("сегодня — воскресенье: неделя та же, что у понедельника", () => {
    const s = weekStrip({ today: "2026-10-25", workoutDays: ["2026-10-25"], plannedDays: [] });
    expect(s[0].day).toBe("2026-10-19");
    expect(s[6]).toMatchObject({ done: true, today: true });
  });

  it("дни вне недели игнорируются", () => {
    expect(weekStrip({ today: "2026-10-22", workoutDays: ["2026-10-18", "2026-10-26"], plannedDays: [] }).some((d) => d.done)).toBe(false);
  });
});

describe("weekCompare", () => {
  it("рост, без изменений, падение", () => {
    const c = weekCompare({ volume: 6800, seconds: 9600, sets: 42, records: 2 }, { volume: 6000, seconds: 9600, sets: 50, records: 0 });
    expect(c.volume).toEqual({ pct: 13, dir: "up" });
    expect(c.seconds).toEqual({ pct: 0, dir: "same" });
    expect(c.sets).toEqual({ pct: -16, dir: "down" });
  });

  it("без прошлой недели или с нулём — без сравнения", () => {
    expect(weekCompare({ volume: 1, seconds: 1, sets: 1, records: 0 }, null).volume).toBeNull();
    expect(weekCompare({ volume: 1, seconds: 1, sets: 1, records: 0 }, { volume: 0, seconds: 0, sets: 0, records: 0 }).volume).toBeNull();
  });
});

describe("balanceSlices", () => {
  it("топ-5 и «прочие», доли в сумме 100", () => {
    const rows = (["CHEST", "LEGS", "BACK", "SHOULDERS", "BICEPS", "TRICEPS", "ABS"] as const).map((group, i) => ({ group, sets: 10 - i }));
    const s = balanceSlices(rows);
    expect(s.map((x) => x.key)).toEqual(["CHEST", "LEGS", "BACK", "SHOULDERS", "BICEPS", "other"]);
    expect(s.at(-1)?.sets).toBe(9);
    expect(s.reduce((a, x) => a + x.pct, 0)).toBe(100);
  });

  it("без подходов — пусто; меньше пяти групп — без «прочих»", () => {
    expect(balanceSlices([{ group: "CHEST", sets: 0 }])).toEqual([]);
    expect(balanceSlices([{ group: "CHEST", sets: 1 }, { group: "BACK", sets: 2 }]).map((x) => x.key)).toEqual(["BACK", "CHEST"]);
  });
});

describe("weekHeadline", () => {
  it("сколько осталось до засчитанной недели", () => {
    expect(weekHeadline(2, 4)).toBe("Ещё 1 тренировка — и неделя засчитана в серию");
    expect(weekHeadline(0, 0)).toBe("Ещё 3 тренировки — и неделя засчитана в серию");
    expect(weekHeadline(3, 4)).toBe("Неделя засчитана — серия 4 недели");
    expect(weekHeadline(5, 1)).toBe("Неделя засчитана — серия 1 неделя");
  });
});

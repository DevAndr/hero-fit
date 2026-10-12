import { describe, expect, it } from "vitest";
import { monthCompare, monthRanges, monthWeeks } from "./month";

const totals = (workouts: number, hours: number, volume: number, records: number) => ({ workouts, hours, volume, records });

describe("monthRanges", () => {
  it("текущий месяц по сегодня против тех же дней прошлого", () => {
    expect(monthRanges("2026-10-12")).toEqual({
      cur: { from: "2026-10-01", to: "2026-10-12" },
      prev: { from: "2026-09-01", to: "2026-09-12" },
      prevFull: { from: "2026-09-01", to: "2026-09-30" },
    });
  });

  it("31-е против короткого февраля — обрезается по длине прошлого месяца", () => {
    expect(monthRanges("2026-03-31").prev).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("январь против декабря прошлого года", () => {
    expect(monthRanges("2027-01-05").prevFull).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("monthWeeks", () => {
  it("понедельники недель, пересекающих месяцы", () => {
    expect(monthWeeks("2026-10-12")).toEqual({
      recent: ["2026-09-28", "2026-10-05", "2026-10-12"],
      before: ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"],
    });
  });
});

describe("monthCompare", () => {
  const trend = { stronger: 2, of: 3, top: [] };

  it("подписи и строки", () => {
    const m = monthCompare(totals(6, 7.5, 12_400, 3), totals(4, 7.5, 900, 5), trend, "2026-10-12");
    expect(m.title).toBe("Октябрь против сентября");
    expect(m.caption).toBe("1–12 октября против 1–12 сентября");
    expect(m.rows).toEqual([
      { label: "Тренировки", cur: "6", prev: "4", dir: "up" },
      { label: "Часы", cur: "7,5", prev: "7,5", dir: "same" },
      { label: "Объём", cur: "12,4 т", prev: "900 кг", dir: "up" },
      { label: "Рекорды", cur: "3", prev: "5", dir: "down" },
    ]);
    expect(m.strength).toEqual(trend);
  });

  it("1-е число — подпись одним днём; без данных силы — strength null", () => {
    const m = monthCompare(totals(1, 1, 0, 0), totals(0, 0, 0, 0), { stronger: 0, of: 0, top: [] }, "2026-10-01");
    expect(m.caption).toBe("1 октября против 1 сентября");
    expect(m.strength).toBeNull();
  });
});

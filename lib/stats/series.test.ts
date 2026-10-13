import { describe, expect, it } from "vitest";
import { activityGrid, rhythm, strengthSeries, weeklySeries, type DayRow } from "./series";

const day = (d: string, volume: number, extra: Partial<DayRow> = {}): DayRow => ({
  day: d,
  volume,
  workouts: 1,
  sec: 3600,
  sets: 10,
  prs: 0,
  ...extra,
});

describe("weeklySeries", () => {
  it("sums days into calendar weeks ending with the current one, empty weeks are zeros", () => {
    const weeks = weeklySeries(
      [
        day("2026-09-28", 2000, { prs: 1 }),
        day("2026-09-30", 3000, { sec: 1800 }),
        day("2026-10-06", 1000),
        day("2026-08-01", 9999), // за пределами окна
      ],
      "2026-10-07",
      3,
    );
    expect(weeks.map((w) => w.week)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
    expect(weeks[0]).toMatchObject({ volume: 0, workouts: 0, density: 0 });
    // 5000 кг за 90 минут → 55,6 кг/мин
    expect(weeks[1]).toMatchObject({ volume: 5000, workouts: 2, hours: 1.5, sets: 20, prs: 1, density: 55.6 });
    expect(weeks[2]).toMatchObject({ volume: 1000, workouts: 1 });
  });
});

describe("activityGrid", () => {
  it("builds Monday-first columns with volume quartile levels; future days are marked", () => {
    const days = [100, 200, 300, 400].map((v, i) => day(`2026-10-0${i + 1}`, v));
    days.push(day("2026-10-06", 0)); // тренировка без веса
    const { columns, thresholds } = activityGrid(days, "2026-10-07", 2);
    expect(columns).toHaveLength(2);
    expect(columns[0][0].day).toBe("2026-09-28");
    expect(columns[1][6]).toMatchObject({ day: "2026-10-11", future: true, level: 0 });
    expect(thresholds).toEqual([200, 300, 400]);
    const level = (d: string) => columns.flat().find((c) => c.day === d)!.level;
    expect([level("2026-10-01"), level("2026-10-02"), level("2026-10-03"), level("2026-10-04")]).toEqual([1, 1, 2, 3]);
    expect(level("2026-10-06")).toBe(1);
    expect(level("2026-10-05")).toBe(0);
  });
});

describe("strengthSeries", () => {
  it("pivots weekly 1RM into one point per week with a key per exercise", () => {
    const { series, points } = strengthSeries(
      [
        { exerciseId: "b", name: "Жим", week: "2026-09-28", oneRm: 100.04 },
        { exerciseId: "s", name: "Присед", week: "2026-10-05", oneRm: 140 },
        { exerciseId: "b", name: "Жим", week: "2026-10-05", oneRm: 102.5 },
      ],
      ["2026-09-28", "2026-10-05"],
    );
    expect(series).toEqual([
      { id: "b", name: "Жим", key: "s0" },
      { id: "s", name: "Присед", key: "s1" },
    ]);
    expect(points).toEqual([
      { week: "2026-09-28", s0: 100, s1: null },
      { week: "2026-10-05", s0: 102.5, s1: 140 },
    ]);
  });
});

describe("rhythm", () => {
  it("fills all weekdays and hours", () => {
    const r = rhythm([{ dow: 1, workouts: 3 }, { dow: 7, workouts: 1 }], [{ hour: 19, workouts: 4 }]);
    expect(r.weekdays.map((d) => d.workouts)).toEqual([3, 0, 0, 0, 0, 0, 1]);
    expect(r.hours).toHaveLength(24);
    expect(r.hours[19]).toEqual({ label: "19:00", workouts: 4 });
  });
});

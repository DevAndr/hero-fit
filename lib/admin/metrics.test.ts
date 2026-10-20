import { describe, expect, it } from "vitest";
import { cohortGrid, deltaPercent, fillDays, fillHours, parseRange } from "./metrics";

describe("deltaPercent", () => {
  it("рост и падение", () => {
    expect(deltaPercent(12, 10)).toBe(20);
    expect(deltaPercent(5, 10)).toBe(-50);
  });
  it("prev = 0 → null", () => {
    expect(deltaPercent(3, 0)).toBeNull();
    expect(deltaPercent(0, 0)).toBeNull();
  });
});

describe("parseRange", () => {
  it("30 и 90", () => {
    expect(parseRange("90")).toBe(90);
    expect(parseRange("30")).toBe(30);
  });
  it("иное → 30", () => {
    for (const r of [undefined, "7", "abc", ["90", "30"]]) expect(parseRange(r)).toBe(30);
  });
});

describe("fillDays", () => {
  it("заполняет пропуски нулями, включая границы", () => {
    expect(fillDays([{ day: "2026-10-02", value: 4 }], "2026-10-01", "2026-10-03")).toEqual([
      { day: "2026-10-01", value: 0 },
      { day: "2026-10-02", value: 4 },
      { day: "2026-10-03", value: 0 },
    ]);
  });
  it("через границу месяца", () => {
    expect(fillDays([], "2026-09-30", "2026-10-01").map((p) => p.day)).toEqual(["2026-09-30", "2026-10-01"]);
  });
});

describe("cohortGrid", () => {
  const current = "2026-10-12";
  it("будущие недели — null, текущая — считается", () => {
    const [row] = cohortGrid(
      [{ week: "2026-10-05", size: 4 }],
      [
        { week: "2026-10-05", offset: 0, users: 4 },
        { week: "2026-10-05", offset: 1, users: 1 },
      ],
      current,
    );
    expect(row.cells).toEqual([100, 25, null, null, null, null, null]);
  });
  it("пустая когорта — нули на прошедших неделях", () => {
    const [row] = cohortGrid([{ week: "2026-10-12", size: 0 }], [], current);
    expect(row.cells).toEqual([0, null, null, null, null, null, null]);
  });
  it("новые недели сверху", () => {
    const rows = cohortGrid(
      [
        { week: "2026-09-28", size: 1 },
        { week: "2026-10-05", size: 1 },
      ],
      [],
      current,
    );
    expect(rows.map((r) => r.week)).toEqual(["2026-10-05", "2026-09-28"]);
  });
});

describe("fillHours", () => {
  it("returns 24 hours with zeros where there is no data", () => {
    const out = fillHours([{ hour: 7, value: 3 }, { hour: 19, value: 5 }]);
    expect(out).toHaveLength(24);
    expect(out[0]).toEqual({ hour: 0, value: 0 });
    expect(out[7]).toEqual({ hour: 7, value: 3 });
    expect(out[19]).toEqual({ hour: 19, value: 5 });
    expect(out[23]).toEqual({ hour: 23, value: 0 });
  });

  it("ignores hours outside 0–23", () => {
    expect(fillHours([{ hour: 24, value: 9 }, { hour: -1, value: 9 }]).every((p) => p.value === 0)).toBe(true);
  });
});

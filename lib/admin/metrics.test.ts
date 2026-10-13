import { describe, expect, it } from "vitest";
import { addDays, cohortGrid, deltaPercent, fillDays, parseRange } from "./metrics";

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

describe("addDays", () => {
  it("через месяц и назад", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
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

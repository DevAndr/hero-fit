import { describe, expect, it } from "vitest";
import { cohortGrid, deltaPercent, fillDays, fillHours, OTHER_KEY, parseBreakdown, parseRange, sourceRows, stackSeries, type SourceRow, type VisitRow } from "./metrics";

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

describe("sourceRows", () => {
  const row = (group: string | null, child: string | null, signups: number, firstWorkout: number, eligible: number, activeWeek2: number): SourceRow => ({
    group,
    child,
    signups,
    firstWorkout,
    eligible,
    activeWeek2,
  });

  it("итог по странице входа из сумм, дети по регистрациям, без eligible — null", () => {
    const [group] = sourceRows([row("program", "direct", 5, 1, 0, 0), row("program", "search", 10, 6, 5, 2)]);
    expect(group).toEqual({
      key: "program",
      signups: 15,
      firstWorkoutPct: 47,
      activeWeek2Pct: 40,
      visitors: null,
      conversionPct: null,
      children: [
        { key: "search", signups: 10, firstWorkoutPct: 60, activeWeek2Pct: 40, visitors: null, conversionPct: null },
        { key: "direct", signups: 5, firstWorkoutPct: 20, activeWeek2Pct: null, visitors: null, conversionPct: null },
      ],
    });
  });

  it("группа null — отдельная; группы по регистрациям убыв.", () => {
    const groups = sourceRows([row("tool", "social", 2, 0, 0, 0), row(null, null, 7, 7, 7, 7), row("home", "direct", 4, 2, 4, 1)]);
    expect(groups.map((g) => g.key)).toEqual([null, "home", "tool"]);
    expect(groups[0]).toMatchObject({ signups: 7, firstWorkoutPct: 100, activeWeek2Pct: 100 });
    expect(groups[2].activeWeek2Pct).toBeNull();
  });

  it("пусто → []", () => {
    expect(sourceRows([])).toEqual([]);
  });
  describe("посетители", () => {
    const visit = (group: string | null, child: string | null, visits: number): VisitRow => ({ group, child, visits });

    it("конверсия = регистрации / посетители; итог группы — сумма детей", () => {
      const [group] = sourceRows([row("home", "search", 3, 0, 0, 0), row("home", "direct", 1, 0, 0, 0)], [visit("home", "search", 12), visit("home", "direct", 8)]);
      expect(group).toMatchObject({ key: "home", signups: 4, visitors: 20, conversionPct: 20 });
      expect(group.children[0]).toMatchObject({ key: "search", visitors: 12, conversionPct: 25 });
    });

    it("посетители без регистраций — группа и строка с нулями", () => {
      const groups = sourceRows([row("home", "direct", 2, 0, 0, 0)], [visit("tool", "search", 5)]);
      const tool = groups.find((g) => g.key === "tool");
      expect(tool).toMatchObject({ signups: 0, firstWorkoutPct: 0, activeWeek2Pct: null, visitors: 5, conversionPct: 0 });
      expect(tool?.children).toEqual([{ key: "search", signups: 0, firstWorkoutPct: 0, activeWeek2Pct: null, visitors: 5, conversionPct: 0 }]);
    });

    it("группа «До учёта» без посетителей — null", () => {
      const groups = sourceRows([row(null, null, 7, 0, 0, 0), row("home", "direct", 1, 0, 0, 0)], [visit("home", "direct", 3)]);
      expect(groups.find((g) => g.key === null)).toMatchObject({ visitors: null, conversionPct: null });
    });

    it("итог группы: в числителе только регистрации пар с учётом заходов", () => {
      const [group] = sourceRows([row("home", "direct", 1, 0, 0, 0), row("home", "search", 10, 0, 0, 0)], [visit("home", "direct", 4)]);
      expect(group).toMatchObject({ signups: 11, visitors: 4, conversionPct: 25 });
      expect(group.children.find((c) => c.key === "search")).toMatchObject({ visitors: null, conversionPct: null });
    });

    it("конверсия больше 100 % — как есть", () => {
      const [group] = sourceRows([row("home", "direct", 6, 0, 0, 0)], [visit("home", "direct", 4)]);
      expect(group.conversionPct).toBe(150);
    });

    it("сортировка: регистрации, затем посетители", () => {
      const groups = sourceRows([row("home", "direct", 2, 0, 0, 0)], [visit("tool", "search", 5), visit("program", "social", 9), visit("home", "direct", 1)]);
      expect(groups.map((g) => g.key)).toEqual(["home", "program", "tool"]);
    });
  });
});

describe("parseBreakdown", () => {
  it("известные режимы", () => {
    for (const m of ["referrer", "source", "campaign"] as const) expect(parseBreakdown(m)).toBe(m);
  });
  it("иное → referrer", () => {
    for (const r of [undefined, "x", ["source", "campaign"]]) expect(parseBreakdown(r)).toBe("referrer");
  });
});

describe("stackSeries", () => {
  const r = (day: string, key: string | null, value: number) => ({ day, key, value });

  it("ряды по убыванию итога, дни без данных — нули", () => {
    const s = stackSeries([r("2026-10-02", "vk", 3), r("2026-10-01", "tg", 5), r("2026-10-02", "tg", 1)], "2026-10-01", "2026-10-03");
    expect(s.series).toEqual([
      { key: "tg", total: 6 },
      { key: "vk", total: 3 },
    ]);
    expect(s.points).toEqual([
      { day: "2026-10-01", values: [5, 0] },
      { day: "2026-10-02", values: [1, 3] },
      { day: "2026-10-03", values: [0, 0] },
    ]);
  });

  it("сверх top — в «прочие» последним рядом; null — обычный ключ", () => {
    const rows = [r("2026-10-01", "a", 9), r("2026-10-01", "b", 8), r("2026-10-01", null, 7), r("2026-10-01", "c", 2), r("2026-10-01", "d", 1)];
    const s = stackSeries(rows, "2026-10-01", "2026-10-01", 3);
    expect(s.series).toEqual([
      { key: "a", total: 9 },
      { key: "b", total: 8 },
      { key: null, total: 7 },
      { key: OTHER_KEY, total: 3 },
    ]);
    expect(s.points[0].values).toEqual([9, 8, 7, 3]);
  });

  it("ключ OTHER_KEY из данных сливается с «прочими» и всегда последний", () => {
    const s = stackSeries([r("2026-10-01", OTHER_KEY, 50), r("2026-10-01", "a", 1)], "2026-10-01", "2026-10-01");
    expect(s.series).toEqual([
      { key: "a", total: 1 },
      { key: OTHER_KEY, total: 50 },
    ]);
  });

  it("равные итоги — по ключу; пусто — без рядов", () => {
    expect(stackSeries([r("2026-10-01", "b", 1), r("2026-10-01", "a", 1)], "2026-10-01", "2026-10-01").series.map((x) => x.key)).toEqual(["a", "b"]);
    expect(stackSeries([], "2026-10-01", "2026-10-02")).toEqual({ series: [], points: [{ day: "2026-10-01", values: [] }, { day: "2026-10-02", values: [] }] });
  });
});

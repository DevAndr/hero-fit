import { describe, expect, it } from "vitest";
import { strengthTrend, trendHeadline, trendLine, trendWindows, type WeekBest } from "./strength";

const W = trendWindows("2026-10-05");
const wb = (exerciseId: string, week: string, oneRm: number | null, sessions = 1, extra: Partial<WeekBest> = {}): WeekBest => ({
  exerciseId,
  name: exerciseId === "bench" ? "Жим штанги лёжа" : exerciseId,
  bodyweight: false,
  week,
  oneRm,
  maxWeight: oneRm ?? 0,
  maxReps: 5,
  sessions,
  ...extra,
});
/** По 2 сессии в каждом окне: значения «раньше» и «сейчас». */
const pair = (id: string, before: number | null, recent: number | null, extra: Partial<WeekBest> = {}) => [
  wb(id, W.before[1], before, 2, extra),
  wb(id, W.recent[2], recent, 2, extra),
];

describe("trendWindows", () => {
  it("4 недели, кончая текущей, и 4 перед ними", () => {
    expect(W).toEqual({
      recent: ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"],
      before: ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07"],
    });
  });
});

describe("strengthTrend", () => {
  it("рост 1ПМ — сильнее", () => {
    expect(strengthTrend(pair("bench", 80, 84), W)).toEqual({
      stronger: 1,
      of: 1,
      top: [{ exerciseId: "bench", name: "Жим штанги лёжа", bodyweight: false, from: 80, to: 84, pct: 0.05 }],
    });
  });

  it("меньше 2 тренировок в окне — не участвует", () => {
    expect(strengthTrend([wb("bench", W.before[0], 80, 1), ...pair("bench", 80, 84).slice(1)], W).of).toBe(0);
  });

  it("сессии окна суммируются по неделям", () => {
    const rows = [wb("bench", W.before[0], 80), wb("bench", W.before[1], 79), wb("bench", W.recent[0], 84, 2)];
    expect(strengthTrend(rows, W).stronger).toBe(1);
  });

  it("держишь уровень и спад — в of, но не в top", () => {
    expect(strengthTrend(pair("bench", 80, 80.4), W)).toEqual({ stronger: 0, of: 1, top: [] });
    expect(strengthTrend(pair("bench", 80, 72), W)).toEqual({ stronger: 0, of: 1, top: [] });
  });

  it("свой вес — по повторам", () => {
    const up = strengthTrend(pair("pull", null, null, { bodyweight: true, maxReps: 0 }).map((r, i) => ({ ...r, maxReps: i ? 11 : 9 })), W);
    expect(up.top[0]).toMatchObject({ bodyweight: true, from: 9, to: 11 });
    const same = strengthTrend(pair("pull", null, null, { bodyweight: true, maxReps: 9 }), W);
    expect(same).toEqual({ stronger: 0, of: 1, top: [] });
  });

  it("с весом, но 1ПМ только в одном окне (сменил диапазон повторов) — не сравнивается", () => {
    // «Раньше» 5×100 кг, «сейчас» 15×60 кг (повторы > 12 — без 1ПМ): не «+200 %»
    const rows = pair("bench", 116, null).map((r, i) => ({ ...r, maxReps: i ? 15 : 5 }));
    expect(strengthTrend(rows, W)).toEqual({ stronger: 0, of: 0, top: [] });
  });

  it("с весом, но без 1ПМ в обоих окнах — по повторам, без NaN", () => {
    const rows = pair("dips", null, null).map((r, i) => ({ ...r, maxReps: i ? 12 : 8 }));
    const t = strengthTrend(rows, W);
    expect(t.top[0]).toMatchObject({ bodyweight: true, from: 8, to: 12 });
    expect(Number.isFinite(t.top[0].pct)).toBe(true);
  });

  it("лёгкое упражнение: округление не прячет рост", () => {
    expect(strengthTrend(pair("curl", 16.3, 16.5), W).top[0]).toMatchObject({ from: 16.3, to: 16.5 });
  });

  it("«раньше» 0 повторов — не участвует", () => {
    const rows = pair("pull", null, null, { bodyweight: true }).map((r, i) => ({ ...r, maxReps: i ? 5 : 0 }));
    expect(strengthTrend(rows, W).of).toBe(0);
  });

  it("топ-3 по убыванию роста, при равенстве — по имени", () => {
    const rows = [...pair("b", 100, 110), ...pair("a", 100, 110), ...pair("c", 100, 120), ...pair("d", 100, 105)];
    const t = strengthTrend(rows, W);
    expect(t).toMatchObject({ stronger: 4, of: 4 });
    expect(t.top.map((i) => i.exerciseId)).toEqual(["c", "a", "b"]);
  });

  it("1ПМ округляется до 0,5", () => {
    expect(strengthTrend(pair("bench", 80.1, 82.3), W).top[0]).toMatchObject({ from: 80, to: 82.5 });
  });
});

describe("тексты", () => {
  it("заголовок", () => {
    expect(trendHeadline({ stronger: 4, of: 6, top: [] })).toBe("Ты стал сильнее в 4 из 6 упражнений");
    expect(trendHeadline({ stronger: 1, of: 1, top: [] })).toBe("Ты стал сильнее в 1 из 1 упражнения");
    expect(trendHeadline({ stronger: 0, of: 5, top: [] })).toBe("Держишь уровень в 5 упражнениях");
    expect(trendHeadline({ stronger: 0, of: 1, top: [] })).toBe("Держишь уровень в 1 упражнении");
  });

  it("строка упражнения", () => {
    expect(trendLine({ exerciseId: "b", name: "Жим штанги лёжа", bodyweight: false, from: 82, to: 85, pct: 0.0366 })).toBe(
      "Жим штанги лёжа · 1ПМ 82 → 85 кг · +4 %",
    );
    expect(trendLine({ exerciseId: "p", name: "Подтягивания", bodyweight: true, from: 9, to: 11, pct: 0.22 })).toBe(
      "Подтягивания · 9 → 11 повторов",
    );
  });
});

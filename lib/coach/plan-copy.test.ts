import { describe, expect, it } from "vitest";
import {
  copyPlan,
  copyPlanText,
  copySummary,
  overwriteCount,
  targetKey,
  type CopyEntry,
  type CopySeries,
  type CopySource,
  type CopyTarget,
} from "./plan-copy";

const today = "2026-10-14"; // ср
const T = "tpl";
const s = (p: Partial<CopySeries> = {}): CopySeries => ({
  templateId: T,
  title: "Ноги — база",
  weekday: 2,
  time: "19:00",
  durationMin: 60,
  startDate: "2026-10-01",
  endDate: null,
  ...p,
});
const e = (p: Partial<CopyEntry> = {}): CopyEntry => ({
  templateId: T,
  title: "Ноги — база",
  date: "2026-10-20",
  time: "19:00",
  durationMin: 60,
  cancelled: false,
  ...p,
});
const t = (p: Partial<CopyTarget> = {}): CopyTarget => ({ templateId: T, exerciseId: "squat", sets: 4, reps: 8, weight: 60, step: 2.5, ...p });
const src = (p: Partial<CopySource> = {}): CopySource => ({
  series: [],
  entries: [],
  targets: [],
  templateExercises: { [T]: ["squat", "press"] },
  ...p,
});
const w = { withWeights: true };

describe("copyPlan — серии", () => {
  it("начавшаяся — с сегодняшнего дня, будущая — со своей даты", () => {
    expect(copyPlan(src({ series: [s({ startDate: "2026-10-01" })] }), today, w).series[0].startDate).toBe("2026-10-14");
    expect(copyPlan(src({ series: [s({ startDate: "2026-10-20" })] }), today, w).series[0].startDate).toBe("2026-10-20");
  });

  it("закончившаяся, без вхождений после сдвига и без шаблона — не копируется", () => {
    expect(copyPlan(src({ series: [s({ endDate: "2026-10-13" })] }), today, w).series).toEqual([]);
    // пн 19-го позже конца 18-го
    expect(copyPlan(src({ series: [s({ weekday: 0, endDate: "2026-10-18" })] }), today, w).series).toEqual([]);
    expect(copyPlan(src({ series: [s({ templateId: null })] }), today, w).series).toEqual([]);
    // ср 14-го = конец — копируется
    expect(copyPlan(src({ series: [s({ weekday: 2, endDate: "2026-10-14" })] }), today, w).series).toHaveLength(1);
  });
});

describe("copyPlan — разовые", () => {
  it("только с сегодняшнего дня, не отменённые и с шаблоном", () => {
    const r = copyPlan(
      src({ entries: [e({ date: "2026-10-13" }), e({ date: "2026-10-14" }), e({ date: "2026-10-15", cancelled: true }), e({ templateId: null })] }),
      today,
      w,
    );
    expect(r.entries.map((x) => x.date)).toEqual(["2026-10-14"]);
  });
});

describe("copyPlan — задания", () => {
  it("только шаблонов скопированных назначений и упражнений из шаблона", () => {
    const r = copyPlan(
      src({ entries: [e()], targets: [t(), t({ exerciseId: "gone" }), t({ templateId: "other" })], templateExercises: { [T]: ["squat"], other: ["squat"] } }),
      today,
      w,
    );
    expect(r.targets).toEqual([t()]);
  });

  it("без весов — вес и шаг пустые, задание из одного веса пропускается; с весами — как есть", () => {
    const source = src({ entries: [e()], targets: [t(), t({ exerciseId: "press", sets: null, reps: null, step: null })] });
    expect(copyPlan(source, today, { withWeights: false }).targets).toEqual([t({ weight: null, step: null })]);
    expect(copyPlan(source, today, w).targets).toHaveLength(2);
  });

  it("назначений нет — заданий тоже", () => {
    expect(copyPlan(src({ targets: [t()] }), today, w).targets).toEqual([]);
  });
});

describe("copySummary", () => {
  it("части с числами, пустые не пишутся", () => {
    const r = copyPlan(
      src({
        series: [s(), s({ weekday: 4 })],
        entries: [e()],
        targets: [t(), t({ exerciseId: "press" })],
      }),
      today,
      w,
    );
    expect(copySummary(r)).toBe("2 серии, 1 разовая тренировка, 2 задания");
    expect(copySummary({ series: [{ ...s(), templateId: T }], entries: [], targets: [] })).toBe("1 серия");
    expect(copySummary({ series: [], entries: [], targets: [] })).toBeNull();
  });
});

describe("overwriteCount", () => {
  it("задания получателя с тем же шаблоном и упражнением", () => {
    const t2 = t({ exerciseId: "press" });
    expect(overwriteCount([t(), t2], [targetKey(t()), "x:y"])).toBe(1);
  });
});

describe("copyPlanText", () => {
  it("число клиентов и пропущенных", () => {
    expect(copyPlanText(1, 0)).toBe("План скопирован 1 клиенту");
    expect(copyPlanText(3, 2)).toBe("План скопирован 3 клиентам · 2 пропущено");
    expect(copyPlanText(2, 1)).toBe("План скопирован 2 клиентам · 1 пропущен");
  });
});

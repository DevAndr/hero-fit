import { describe, expect, it } from "vitest";
import { dayKey } from "@/lib/daily-login";
import { assignProgramSchema, isDeloadWeek, programLabel, programPreview, programSchema, programWeek, programWeekIndex, type ProgramRule } from "./program";

const rule = (patch: Partial<ProgramRule> = {}): ProgramRule => ({ weeks: 7, stepKind: "PERCENT", stepValue: 2.5, deloadEvery: 4, deloadPct: 10, ...patch });
const base = (weight: number, fromWeek = 1) => ({ weight, fromWeek });

describe("programWeekIndex", () => {
  it("неделя — с понедельника старта; до старта — null", () => {
    expect(programWeekIndex("2026-10-19", "2026-10-18")).toBeNull();
    expect(programWeekIndex("2026-10-19", "2026-10-19")).toBe(1);
    expect(programWeekIndex("2026-10-19", "2026-10-25")).toBe(1);
    expect(programWeekIndex("2026-10-19", "2026-10-26")).toBe(2);
  });
  it("день — в поясе клиента: ночь вс→пн по Москве уже следующая неделя", () => {
    const at = new Date("2026-10-25T22:30:00Z");
    expect(programWeekIndex("2026-10-19", dayKey(at, "Europe/Moscow"))).toBe(2);
    expect(programWeekIndex("2026-10-19", dayKey(at, "UTC"))).toBe(1);
  });
});

describe("programWeek", () => {
  it("проверочный пример: +2,5 %, разгрузка каждая 4-я −10 %", () => {
    expect(programPreview(rule(), base(100)).map((w) => w.weight)).toEqual([100, 102.5, 105, 95, 107.5, 110, 112.5]);
    expect(programWeek(rule(), base(100), 4)).toEqual({ weight: 95, setsDelta: -1, deload: true });
    expect(programWeek(rule(), base(100), 3)).toEqual({ weight: 105, setsDelta: 0, deload: false });
    expect(isDeloadWeek(8, 4)).toBe(true);
    expect(isDeloadWeek(8, null)).toBe(false);
  });
  it("шаг в кг", () => {
    expect(programWeek(rule({ stepKind: "KG", deloadEvery: null }), base(60), 3).weight).toBe(65);
  });
  it("гантели округляются до 0,5 кг; обычная неделя не ниже базы", () => {
    expect(programWeek(rule({ stepValue: 5, deloadEvery: null }), base(12), 2).weight).toBe(12.5);
    expect(programWeek(rule({ stepValue: 2, deloadEvery: null }), base(10), 2).weight).toBe(10);
    // 21 кг округлилось бы до 20 — неделя 1 остаётся на базе
    expect(programWeek(rule({ deloadEvery: null }), base(21), 1).weight).toBe(21);
  });
  it("своим весом (база 0): вес 0, разгрузка — только подходы", () => {
    expect(programWeek(rule(), base(0), 4)).toEqual({ weight: 0, setsDelta: -1, deload: true });
    expect(programWeek(rule(), base(0), 2)).toEqual({ weight: 0, setsDelta: 0, deload: false });
  });
  it("«Изменить базу» с недели 3: рост заново от новой базы", () => {
    expect(programWeek(rule(), base(95, 3), 3).weight).toBe(95);
    expect(programWeek(rule(), base(95, 3), 4).weight).toBe(85);
    expect(programWeek(rule(), base(95, 3), 5).weight).toBe(97.5);
  });
});

describe("programLabel", () => {
  it("неделя и разгрузка", () => {
    expect(programLabel(3, 8, false)).toBe("Неделя 3/8");
    expect(programLabel(4, 8, true)).toBe("Разгрузка · неделя 4/8");
  });
});

describe("схемы", () => {
  const program = {
    name: "Сила 8 недель",
    weeks: 8,
    stepKind: "PERCENT" as const,
    stepValue: 2.5,
    deloadEvery: 4,
    deloadPct: 10,
    days: [{ weekday: 0, templateId: "t1", time: "18:00", durationMin: 60 }],
  };
  it("программа: недели 2…16, дни без повторов", () => {
    expect(programSchema.safeParse(program).success).toBe(true);
    expect(programSchema.safeParse({ ...program, weeks: 1 }).success).toBe(false);
    expect(programSchema.safeParse({ ...program, weeks: 17 }).success).toBe(false);
    expect(programSchema.safeParse({ ...program, days: [...program.days, { ...program.days[0], templateId: "t2" }] }).success).toBe(false);
  });
  it("назначение: старт — понедельник", () => {
    const input = { programId: "p1", startDate: "2026-10-19", bases: [{ templateId: "t1", exerciseId: "e1", weight: 100 }] };
    expect(assignProgramSchema.safeParse(input).success).toBe(true);
    expect(assignProgramSchema.safeParse({ ...input, startDate: "2026-10-20" }).success).toBe(false);
  });
});

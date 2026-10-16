import { describe, expect, it } from "vitest";
import { dayKey } from "@/lib/daily-login";
import { applyProgramToTargets, seriesCutoff, assignProgramSchema, baseForWeekWeight, basesToWrite, targetEditedAfterEnd, shouldRemindProgramEnd, isDeloadWeek, lastLoadedWeight, seriesStarts, programLabel, programPreview, programSchema, programWeek, programWeekIndex, type ProgramRule } from "./program";

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

describe("seriesStarts", () => {
  it("старт на текущей неделе в четверг: прошедшие дни — со следующей недели, без задним числом", () => {
    expect(seriesStarts("2026-10-12", [0, 2, 4], "2026-10-15")).toEqual([
      { weekday: 0, startDate: "2026-10-19" },
      { weekday: 2, startDate: "2026-10-21" },
      { weekday: 4, startDate: "2026-10-16" },
    ]);
    expect(seriesStarts("2026-10-19", [0], "2026-10-15")).toEqual([{ weekday: 0, startDate: "2026-10-19" }]);
  });
});

describe("lastLoadedWeight", () => {
  it("вес последней обычной недели — не разгрузки", () => {
    expect(lastLoadedWeight(rule(), base(100), 4)).toBe(105);
    expect(lastLoadedWeight(rule(), base(100), 2)).toBe(102.5);
    expect(lastLoadedWeight(rule(), base(100), 0)).toBe(100);
  });
});

describe("applyProgramToTargets", () => {
  const r = rule({ weeks: 8 });
  const tpl = new Map([["press", 3], ["pull", 3], ["fly", 3]]);
  const bases = [
    { exerciseId: "press", weight: 100, fromWeek: 1 },
    { exerciseId: "pull", weight: 0, fromWeek: 1 },
  ];
  it("вес недели поверх задания; повторы и подходы задания остаются", () => {
    const targets = new Map([["press", { sets: 4, reps: 8, weight: 60 }]]);
    expect(applyProgramToTargets(targets, tpl, bases, r, 3).get("press")).toEqual({ sets: 4, reps: 8, weight: 105, program: "Неделя 3/8" });
  });
  it("разгрузка: подходов на 1 меньше; без задания — подходы шаблона", () => {
    const out = applyProgramToTargets(new Map(), tpl, bases, r, 4);
    expect(out.get("press")).toEqual({ sets: 2, reps: null, weight: 95, program: "Разгрузка · неделя 4/8" });
    // Своим весом: вес — по истории (null), подходы −1
    expect(out.get("pull")).toEqual({ sets: 2, reps: null, weight: null, program: "Разгрузка · неделя 4/8" });
  });
  it("упражнение без базы (добавили в шаблон позже) не трогается", () => {
    const targets = new Map([["fly", { sets: 3, reps: 12, weight: 14 }]]);
    expect(applyProgramToTargets(targets, tpl, bases, r, 2).get("fly")).toEqual({ sets: 3, reps: 12, weight: 14 });
  });
  it("база есть, а упражнение убрали из шаблона и задания нет — пропуск, без падения", () => {
    const out = applyProgramToTargets(new Map(), new Map([["pull", 3]]), bases, r, 2);
    expect(out.has("press")).toBe(false);
    expect(out.get("pull")?.sets).toBe(3);
  });
});

describe("shouldRemindProgramEnd", () => {
  it("за 7 дней до конца и позже — один раз", () => {
    expect(shouldRemindProgramEnd("2026-11-15", "2026-11-07", null)).toBe(false);
    expect(shouldRemindProgramEnd("2026-11-15", "2026-11-08", null)).toBe(true);
    expect(shouldRemindProgramEnd("2026-11-15", "2026-11-15", null)).toBe(true);
    expect(shouldRemindProgramEnd("2026-11-15", "2026-11-16", null)).toBe(false);
    expect(shouldRemindProgramEnd("2026-11-15", "2026-11-10", new Date())).toBe(false);
  });
});

describe("basesToWrite — веса программы в задания при окончании", () => {
  const b = (templateId: string, exerciseId: string, weight = 100, fromWeek = 1) => ({ templateId, exerciseId, weight, fromWeek });
  const pairs = new Set(["t1:squat", "t1:press"]);
  it("только пары, что ещё есть в шаблонах тренера (шаблон или упражнение удалены — пропуск)", () => {
    expect(basesToWrite([b("t1", "squat"), b("t2", "squat"), b("t1", "gone")], pairs, 3)).toEqual([b("t1", "squat")]);
  });
  it("программа не началась — ничего не пишем", () => {
    expect(basesToWrite([b("t1", "squat")], pairs, 0)).toEqual([]);
  });
  it("базу изменили на текущей неделе и сразу завершили — пишем новую базу (не откат к весу до программы)", () => {
    expect(basesToWrite([b("t1", "squat", 100, 4)], pairs, 3)).toEqual([b("t1", "squat", 100, 4)]);
    expect(lastLoadedWeight(rule(), base(120, 4), 3)).toBe(120);
  });
  it("база 0 (своим весом) не пишется", () => {
    expect(basesToWrite([b("t1", "press", 0)], pairs, 3)).toEqual([]);
  });
});

describe("baseForWeekWeight — «Изменить базу»", () => {
  it("в обычную неделю база = введённому", () => {
    expect(baseForWeekWeight(rule(), 100, 3)).toBe(100);
  });
  it("в разгрузку вес этой недели равен введённому, дальше рост выше него", () => {
    const base = baseForWeekWeight(rule(), 100, 4);
    expect(programWeek(rule(), { weight: base, fromWeek: 4 }, 4).weight).toBe(100);
    expect(programWeek(rule(), { weight: base, fromWeek: 4 }, 5).weight).toBeGreaterThan(100);
  });
});

describe("targetEditedAfterEnd", () => {
  it("тренер правил задание после конца программы — окончание по сроку его не затирает", () => {
    expect(targetEditedAfterEnd(new Date("2026-12-08T09:00:00Z"), "2026-12-06")).toBe(true);
    expect(targetEditedAfterEnd(new Date("2026-12-01T09:00:00Z"), "2026-12-06")).toBe(false);
    expect(targetEditedAfterEnd(null, "2026-12-06")).toBe(false);
  });
});

describe("seriesCutoff — с какого дня убрать вхождения серий при окончании", () => {
  it("досрочно — сегодняшняя тренировка остаётся, убираем с завтра", () => {
    expect(seriesCutoff("2026-11-11", true)).toBe("2026-11-12");
  });
  it("новая программа — с сегодня (вместо неё сегодняшняя новой)", () => {
    expect(seriesCutoff("2026-11-11", false)).toBe("2026-11-11");
  });
});

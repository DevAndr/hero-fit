import { describe, expect, it } from "vitest";
import { formatTarget, isEmptyTarget, parseTargetInput, plannedSets, targetSchema, validateTargetItems } from "./targets";

const te = { targetSets: 3, targetReps: 10, targetWeight: 20 };
const last = [
  { weight: 50, reps: 8 },
  { weight: 55, reps: 6 },
];

describe("plannedSets", () => {
  it("без задания — прежние правила", () => {
    expect(plannedSets(te, last)).toEqual([
      { weight: 50, reps: 10 },
      { weight: 55, reps: 10 },
      { weight: 55, reps: 10 },
    ]);
    // Повторы лишнего подхода без повторов в шаблоне — 0, как было (вес — с последнего подхода)
    expect(plannedSets({ ...te, targetReps: null }, last)).toEqual([
      { weight: 50, reps: 8 },
      { weight: 55, reps: 6 },
      { weight: 55, reps: 0 },
    ]);
    expect(plannedSets(te, [])).toEqual(Array(3).fill({ weight: 20, reps: 10 }));
    expect(plannedSets({ targetSets: 2, targetReps: null, targetWeight: null }, [])).toEqual(Array(2).fill({ weight: 0, reps: 0 }));
  });

  it("полное задание важнее шаблона и истории", () => {
    expect(plannedSets(te, last, { sets: 4, reps: 8, weight: 60 })).toEqual(Array(4).fill({ weight: 60, reps: 8 }));
  });

  it("частичное задание — только заданные поля", () => {
    expect(plannedSets(te, last, { sets: null, reps: null, weight: 62.5 })).toEqual(Array(3).fill({ weight: 62.5, reps: 10 }));
    expect(plannedSets(te, last, { sets: 2, reps: null, weight: null })).toEqual([
      { weight: 50, reps: 10 },
      { weight: 55, reps: 10 },
    ]);
  });

  it("вес 0 в задании — тоже задание (своим весом)", () => {
    expect(plannedSets(te, last, { sets: null, reps: null, weight: 0 })).toEqual(Array(3).fill({ weight: 0, reps: 10 }));
  });
});

describe("formatTarget", () => {
  it("пустые поля пропускаются", () => {
    expect(formatTarget({ sets: 4, reps: 8, weight: 60 })).toBe("от тренера: 4 × 8 · 60 кг");
    expect(formatTarget({ sets: null, reps: null, weight: 62.5 })).toBe("от тренера: 62,5 кг");
    expect(formatTarget({ sets: 4, reps: 8, weight: null })).toBe("от тренера: 4 × 8");
    expect(formatTarget({ sets: 5, reps: null, weight: null })).toBe("от тренера: 5 подходов");
    expect(formatTarget({ sets: null, reps: 12, weight: null })).toBe("от тренера: по 12 повторов");
    expect(formatTarget({ sets: null, reps: null, weight: null })).toBeNull();
  });
});

describe("targetSchema", () => {
  const ok = { exerciseId: "x", sets: 20, reps: 100, weight: 1000 };
  it("пределы", () => {
    expect(targetSchema.safeParse(ok).success).toBe(true);
    expect(targetSchema.safeParse({ ...ok, sets: 0 }).success).toBe(false);
    expect(targetSchema.safeParse({ ...ok, sets: 2.5 }).success).toBe(false);
    expect(targetSchema.safeParse({ ...ok, reps: 0 }).success).toBe(false);
    expect(targetSchema.safeParse({ ...ok, weight: 1000.5 }).success).toBe(false);
    expect(targetSchema.safeParse({ ...ok, weight: -1 }).success).toBe(false);
    expect(targetSchema.safeParse({ exerciseId: "x", sets: null, reps: null, weight: null }).success).toBe(true);
  });
});

describe("isEmptyTarget / validateTargetItems", () => {
  it("пустое задание", () => {
    expect(isEmptyTarget({ sets: null, reps: null, weight: null })).toBe(true);
    expect(isEmptyTarget({ sets: null, reps: null, weight: 0 })).toBe(false);
  });
  it("только упражнения шаблона, без повторов", () => {
    expect(validateTargetItems([{ exerciseId: "a" }], ["a", "b"])).toBe(true);
    expect(validateTargetItems([{ exerciseId: "c" }], ["a", "b"])).toBe(false);
    expect(validateTargetItems([{ exerciseId: "a" }, { exerciseId: "a" }], ["a"])).toBe(false);
  });
});

describe("parseTargetInput", () => {
  it("пусто — null, запятая — дробь", () => {
    expect(parseTargetInput("  ")).toBeNull();
    expect(parseTargetInput("62,5")).toBe(62.5);
    expect(parseTargetInput("0")).toBe(0);
  });
  it("мусор — NaN, а не 0 кг", () => {
    expect(parseTargetInput("abc")).toBeNaN();
    expect(parseTargetInput("-5")).toBeNaN();
    expect(parseTargetInput(".")).toBeNaN();
    expect(parseTargetInput("5кг")).toBeNaN();
  });
  it("целые поля не округляются молча", () => {
    expect(parseTargetInput("2.5", { int: true })).toBeNaN();
    expect(parseTargetInput("4", { int: true })).toBe(4);
  });
});

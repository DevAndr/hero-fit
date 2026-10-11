import { describe, expect, it } from "vitest";
import { carryFails, ownTargets, progressionHint, type OwnRow } from "./progression";
import { templateSchema } from "./schema";

const row = (p: Partial<OwnRow> = {}): OwnRow => ({ exerciseId: "a", targetSets: 4, targetReps: 8, targetWeight: 60, step: 2.5, fails: 0, ...p });

describe("carryFails", () => {
  it("вес и шаг те же — счётчик остаётся, иначе с нуля", () => {
    const old = { targetWeight: 60, step: 2.5, fails: 2 };
    expect(carryFails(old, { targetWeight: 60, step: 2.5 })).toBe(2);
    expect(carryFails(old, { targetWeight: 62.5, step: 2.5 })).toBe(0);
    expect(carryFails(old, { targetWeight: 60, step: 5 })).toBe(0);
    expect(carryFails(undefined, { targetWeight: 60, step: 2.5 })).toBe(0);
  });
});

describe("ownTargets", () => {
  it("только строки с весом и шагом; на упражнение — первая", () => {
    const t = ownTargets([
      row({ step: null }),
      row({ exerciseId: "b", targetWeight: null }),
      row({ exerciseId: "c" }),
      row({ exerciseId: "c", targetWeight: 99 }),
    ]);
    expect([...t]).toEqual([["c", { sets: 4, reps: 8, weight: 60 }]]);
  });
});

describe("progressionHint", () => {
  it("цель и шаг; без повторов — по одному; своим весом — отягощение", () => {
    expect(progressionHint(row())).toBe("Прогрессия: +2,5 кг, когда сделаешь 4 × 8 · 60 кг");
    expect(progressionHint(row({ targetSets: 3, targetReps: null, targetWeight: 10, step: 1 }), { bodyweight: true })).toBe(
      "Прогрессия: +1 кг, когда сделаешь 3 × 1 · +10 кг",
    );
    expect(progressionHint(row({ step: null }))).toBeNull();
    expect(progressionHint(row({ targetWeight: null }))).toBeNull();
  });
});

describe("templateSchema — шаг", () => {
  const tpl = (e: Record<string, unknown>) => ({
    name: "Ноги",
    description: "",
    exercises: [{ exerciseId: "a", targetSets: 4, targetReps: 8, targetWeight: 60, restSec: 90, ...e }],
  });
  it("шаг 0,5…20, без веса — ошибка, без шага — можно", () => {
    const noWeight = templateSchema.safeParse(tpl({ targetWeight: null, step: 2.5 }));
    expect(noWeight.success).toBe(false);
    expect(noWeight.error?.issues[0].message).toBe("Для прогрессии нужен вес");
    expect(templateSchema.safeParse(tpl({ step: 0.4 })).success).toBe(false);
    expect(templateSchema.safeParse(tpl({ step: 21 })).success).toBe(false);
    expect(templateSchema.parse(tpl({})).exercises[0].step).toBeNull();
    expect(templateSchema.parse(tpl({ step: 2.5 })).exercises[0].step).toBe(2.5);
  });
});

import { describe, expect, it } from "vitest";
import { carryFails, keepProgress, ownTargets, progressionHint, rowFails, type OwnRow } from "./progression";
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

  it("сменилась цель (подходы или повторы) — счёт с нуля", () => {
    const old = { targetSets: 4, targetReps: 8, targetWeight: 60, step: 2.5, fails: 2 };
    expect(carryFails(old, { targetSets: 4, targetReps: 10, targetWeight: 60, step: 2.5 })).toBe(0);
    expect(carryFails(old, { targetSets: 5, targetReps: 8, targetWeight: 60, step: 2.5 })).toBe(0);
    expect(carryFails(old, { targetSets: 4, targetReps: 8, targetWeight: 60, step: 2.5 })).toBe(2);
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

describe("rowFails — пересохранение шаблона", () => {
  it("неудачи переносятся только первой строке упражнения, по первой старой строке", () => {
    const old = [row({ fails: 2 }), row({ step: null, fails: 0 })]; // упражнение дважды: первая — с шагом
    const next = [row({ fails: 0 }), row({ step: null, fails: 0 })];
    expect(rowFails(next, old)).toEqual([2, 0]);
  });
});

describe("keepProgress — «Добавить в шаблон» из тренировки", () => {
  it("первая строка упражнения с прогрессией сохраняет цель целиком; повтор упражнения — как из тренировки", () => {
    const old = [row({ targetSets: 4, targetReps: 8, targetWeight: 62.5, fails: 1 }), row({ targetWeight: 60, fails: 0 })];
    const fromWorkout = [
      { exerciseId: "a", targetSets: 3, targetReps: 6, targetWeight: 60, restSec: 90 },
      { exerciseId: "a", targetSets: 2, targetReps: 5, targetWeight: 40, restSec: 90 },
      { exerciseId: "b", targetSets: 3, targetReps: 10, targetWeight: 20, restSec: 60 },
    ];
    expect(keepProgress(fromWorkout, old)).toEqual([
      { exerciseId: "a", targetSets: 4, targetReps: 8, targetWeight: 62.5, step: 2.5, fails: 1, restSec: 90 },
      { exerciseId: "a", targetSets: 2, targetReps: 5, targetWeight: 40, restSec: 90 },
      { exerciseId: "b", targetSets: 3, targetReps: 10, targetWeight: 20, restSec: 60 },
    ]);
  });
});

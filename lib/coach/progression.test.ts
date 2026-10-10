import { describe, expect, it } from "vitest";
import { progressionLine, progressTarget } from "./progression";
import { targetSchema } from "./targets";

const target = { sets: 3, reps: 5, weight: 60, step: 2.5, fails: 1 };
const template = { sets: 3, reps: 8 };
const sets = (n: number, weight: number, reps: number) => Array.from({ length: n }, () => ({ weight, reps }));

describe("progressTarget", () => {
  it("успех — +шаг, неудачи сбрасываются", () => {
    expect(progressTarget({ target, template, done: sets(3, 60, 5) })).toEqual({ weight: 62.5, fails: 0, kind: "up", from: 60, to: 62.5 });
  });
  it("подходов больше нужного — тоже успех", () => {
    expect(progressTarget({ target, template, done: sets(4, 60, 5) })?.kind).toBe("up");
  });
  it("подход легче задания не засчитывается", () => {
    expect(progressTarget({ target, template, done: [...sets(2, 60, 5), { weight: 55, reps: 5 }] })).toEqual({
      weight: 60,
      fails: 2,
      kind: "same",
      from: 60,
      to: 60,
    });
  });
  it("повторов меньше — неудача", () => {
    expect(progressTarget({ target, template, done: sets(3, 60, 4) })?.kind).toBe("same");
  });
  it("третья неудача — разгрузка вниз до 2,5 кг", () => {
    const third = { ...target, fails: 2 };
    expect(progressTarget({ target: third, template, done: sets(1, 60, 5) })).toEqual({ weight: 52.5, fails: 0, kind: "deload", from: 60, to: 52.5 });
    expect(progressTarget({ target: { ...third, weight: 62.5 }, template, done: sets(1, 62.5, 5) })?.to).toBe(55);
    expect(progressTarget({ target: { ...third, weight: 2.5 }, template, done: sets(1, 2.5, 5) })?.to).toBe(0);
  });
  it("не попытка или нет прогрессии — null", () => {
    expect(progressTarget({ target, template, done: [] })).toBeNull();
    expect(progressTarget({ target: { ...target, step: null }, template, done: sets(3, 60, 5) })).toBeNull();
    expect(progressTarget({ target: { ...target, weight: null }, template, done: sets(3, 60, 5) })).toBeNull();
  });
  it("повторы — из шаблона, если в задании пусто; нигде нет — любые > 0", () => {
    const noReps = { ...target, reps: null };
    expect(progressTarget({ target: noReps, template, done: sets(3, 60, 5) })?.kind).toBe("same");
    expect(progressTarget({ target: noReps, template, done: sets(3, 60, 8) })?.kind).toBe("up");
    expect(progressTarget({ target: noReps, template: { sets: 3, reps: null }, done: sets(3, 60, 1) })?.kind).toBe("up");
  });
  it("подходы — из шаблона, если в задании пусто", () => {
    expect(progressTarget({ target: { ...target, sets: null }, template: { sets: 4, reps: 5 }, done: sets(3, 60, 5) })?.kind).toBe("same");
  });
  it("отягощение с нуля и дробный шаг без погрешности", () => {
    expect(progressTarget({ target: { ...target, weight: 0 }, template, done: sets(3, 0, 5) })?.to).toBe(2.5);
    expect(progressTarget({ target: { ...target, weight: 20.1, step: 0.7 }, template, done: sets(3, 20.1, 5) })?.to).toBe(20.8);
  });
});

describe("progressionLine", () => {
  const base = { exercise: "Присед", from: 60, to: 62.5, fails: 0, bodyweight: false };
  it("три вида", () => {
    expect(progressionLine({ ...base, kind: "up" })).toBe("Присед: в следующий раз 62,5 кг (+2,5)");
    expect(progressionLine({ ...base, kind: "same", to: 60, fails: 2 })).toBe("Присед: повторим 60 кг · неудача 2 из 3");
    expect(progressionLine({ ...base, kind: "deload", to: 52.5 })).toBe("Присед: разгрузка — 52,5 кг (−10 %)");
  });
  it("своим весом — отягощение", () => {
    expect(progressionLine({ ...base, kind: "up", bodyweight: true })).toBe("Присед: в следующий раз +62,5 кг (+2,5)");
  });
});

describe("targetSchema.step", () => {
  const ok = { exerciseId: "x", sets: null, reps: null, weight: 60, step: 2.5 };
  it("пределы шага", () => {
    expect(targetSchema.safeParse(ok).success).toBe(true);
    expect(targetSchema.safeParse({ ...ok, step: null }).success).toBe(true);
    expect(targetSchema.safeParse({ ...ok, step: 0.4 }).success).toBe(false);
    expect(targetSchema.safeParse({ ...ok, step: 20.5 }).success).toBe(false);
  });
});

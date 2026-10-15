import { describe, expect, it } from "vitest";
import { typoWarning } from "./typo";

const last = (weight: number, reps: number) => ({ weight, reps, source: "last" as const });
const prev = (weight: number, reps: number) => ({ weight, reps, source: "set" as const });

describe("typoWarning", () => {
  it("weight jump ×1.5 and +10 kg — extra zero", () => {
    expect(typoWarning({ weight: 600, reps: 10 }, last(60, 10))).toBe("В прошлый раз 60 кг — точно 600?");
    expect(typoWarning({ weight: 150, reps: 5 }, prev(100, 5))).toBe("В прошлом подходе 100 кг — точно 150?");
    expect(typoWarning({ weight: 62.5, reps: 10 }, last(60, 10))).toBeNull();
    // ×1.5, но меньше 10 кг — лёгкие гантели
    expect(typoWarning({ weight: 12, reps: 10 }, last(8, 10))).toBeNull();
  });

  it("weight drop to a quarter or less — missing digit", () => {
    expect(typoWarning({ weight: 12, reps: 5 }, last(120, 5))).toBe("В прошлый раз 120 кг — точно 12?");
    expect(typoWarning({ weight: 60, reps: 8 }, prev(100, 5))).toBeNull(); // дропсет
  });

  it("reps ×3 and +15, or over 100", () => {
    expect(typoWarning({ weight: 20, reps: 112 }, prev(20, 11))).toBe("В прошлом подходе 11 повторов — точно 112?");
    expect(typoWarning({ weight: 0, reps: 45 }, last(0, 12))).toBe("В прошлый раз 12 повторов — точно 45?");
    expect(typoWarning({ weight: 0, reps: 30 }, last(0, 20))).toBeNull();
    expect(typoWarning({ weight: 0, reps: 120 }, null)).toBe("Точно 120 повторов?");
    expect(typoWarning({ weight: 0, reps: 1 }, last(0, 1))).toBeNull();
  });

  it("no reference, empty values or bodyweight reference — only the absolute reps rule", () => {
    expect(typoWarning({ weight: 600, reps: 10 }, null)).toBeNull();
    expect(typoWarning({ weight: 0, reps: 0 }, last(60, 10))).toBeNull();
    expect(typoWarning({ weight: 40, reps: 10 }, last(0, 10))).toBeNull();
  });
});

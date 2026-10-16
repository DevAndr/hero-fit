import { describe, expect, it } from "vitest";
import { cardioWarning, typoWarning } from "./typo";

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

describe("cardioWarning", () => {
  it("дистанция без времени — подход не засчитается", () => {
    expect(cardioWarning({ durationSec: 0, distanceM: 5000 })).toBe("Укажите время — без него подход не засчитается");
  });
  it("быстрее 60 км/ч — похоже на опечатку в дистанции", () => {
    expect(cardioWarning({ durationSec: 1720, distanceM: 52_000 })).toBe("Точно 52 км за 28:40? Это 109 км/ч");
    expect(cardioWarning({ durationSec: 1720, distanceM: 5200 })).toBeNull();
    // Велотренажёр: 40 км/ч — норма
    expect(cardioWarning({ durationSec: 3600, distanceM: 40_000 })).toBeNull();
  });
  it("пусто или только время — без подсказки", () => {
    expect(cardioWarning({ durationSec: 0, distanceM: 0 })).toBeNull();
    expect(cardioWarning({ durationSec: 600, distanceM: 0 })).toBeNull();
  });
});

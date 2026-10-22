import { describe, expect, it } from "vitest";
import { imbalanceHint, muscleBalance } from "./balance";

describe("muscleBalance", () => {
  it("все 11 групп, уровень 0…4 от максимума, нетронутые — отдельно", () => {
    const b = muscleBalance([
      { group: "CHEST", sets: 12 },
      { group: "BACK", sets: 6 },
      { group: "BICEPS", sets: 1 },
    ]);
    expect(b.groups).toHaveLength(11);
    const level = Object.fromEntries(b.groups.map((g) => [g.group, g.level]));
    expect(level).toMatchObject({ CHEST: 4, BACK: 2, BICEPS: 1, LEGS: 0 });
    expect(b.untouched).toEqual(["LEGS", "GLUTES", "SHOULDERS", "FOREARMS", "CALVES", "TRICEPS", "TRAPS", "ABS"]);
  });

  it("перекос в паре — от 6 подходов и вдвое больше", () => {
    expect(muscleBalance([{ group: "CHEST", sets: 12 }, { group: "BACK", sets: 4 }]).imbalances).toEqual([
      { more: "CHEST", less: "BACK", moreSets: 12, lessSets: 4 },
    ]);
    // вдвое, но мало подходов — не перекос
    expect(muscleBalance([{ group: "BICEPS", sets: 4 }, { group: "TRICEPS", sets: 1 }]).imbalances).toEqual([]);
    // много, но меньше чем вдвое
    expect(muscleBalance([{ group: "BACK", sets: 10 }, { group: "CHEST", sets: 6 }]).imbalances).toEqual([]);
    expect(muscleBalance([{ group: "TRICEPS", sets: 6 }]).imbalances).toEqual([
      { more: "TRICEPS", less: "BICEPS", moreSets: 6, lessSets: 0 },
    ]);
  });
});

describe("imbalanceHint", () => {
  it("кратность и совет для отстающей группы", () => {
    expect(imbalanceHint({ more: "CHEST", less: "BACK", moreSets: 12, lessSets: 4 })).toBe("Грудь ×3 к спине — добавьте тяги");
    expect(imbalanceHint({ more: "BACK", less: "CHEST", moreSets: 10, lessSets: 4 })).toBe("Спина ×2,5 к груди — добавьте жимы");
    expect(imbalanceHint({ more: "TRICEPS", less: "BICEPS", moreSets: 6, lessSets: 0 })).toBe(
      "Трицепс: 6 подходов, бицепс — ни одного — добавьте сгибания на бицепс",
    );
  });
});

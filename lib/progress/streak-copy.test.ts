import { describe, expect, it } from "vitest";
import { streakHint, streakMessage, weeksText } from "./streak-copy";

const progress = { streak: 3, count: 1, needed: 2, daysLeft: 5 };

describe("streak copy", () => {
  it("weeksText", () => {
    expect(weeksText(1)).toBe("1 неделя");
    expect(weeksText(3)).toBe("3 недели");
    expect(weeksText(12)).toBe("12 недель");
  });

  it("dashboard message by state", () => {
    expect(streakMessage({ state: "none" })).toBe("Сделайте 3 тренировки за неделю, чтобы зажечь серию");
    expect(streakMessage({ state: "done", streak: 3 })).toBe("Неделя засчитана 🔥");
    expect(streakMessage({ state: "pending", ...progress })).toBe("Эта неделя: 1/3 · осталось 5 дней");
    expect(streakMessage({ state: "pending", ...progress, daysLeft: 3, count: 1, needed: 2 })).toBe("Эта неделя: 1/3 · осталось 3 дня");
    expect(streakMessage({ state: "pending", ...progress, daysLeft: 2 })).toBe("Не потеряй streak! Ещё 2 тренировки до конца недели");
    expect(streakMessage({ state: "frozen", ...progress, freezesNeeded: 1 })).toBe("Неделя пропущена — серию спасёт заморозка");
    expect(streakMessage({ state: "frozen", ...progress, daysLeft: 1, needed: 1, freezesNeeded: 1 })).toBe(
      "Не потеряй streak! Ещё 1 тренировка до конца недели",
    );
    expect(streakMessage({ state: "lost", streak: 3 })).toBe("Серия прервалась — начните новую");
  });

  it("urgent only while the week is still winnable", () => {
    expect(streakMessage({ state: "pending", ...progress, count: 3, needed: 0, daysLeft: 1 })).not.toContain("Не потеряй");
  });

  it("header hint", () => {
    expect(streakHint({ state: "done", streak: 3 })).toBe("Неделя засчитана");
    expect(streakHint({ state: "pending", ...progress })).toBe("Эта неделя: 1/3, осталось 5 дней");
    expect(streakHint({ state: "none" })).toBe("Streak — недели подряд с 3+ тренировками");
  });
});

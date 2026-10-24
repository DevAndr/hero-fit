import { describe, expect, it } from "vitest";
import { coinGroup, coinWeeks } from "./coin-stats";

describe("coinGroup", () => {
  it("сундуки — одной группой, серия и уровни — вместе", () => {
    expect(coinGroup("WORKOUT")).toBe("workout");
    expect(coinGroup("RECORD")).toBe("record");
    expect(coinGroup("ACHIEVEMENT")).toBe("achievement");
    for (const r of ["DAILY_CHEST", "BOSS_CHEST", "RAID_CHEST", "GOAL_CHEST", "CLUB_TASK_CHEST", "GOBLIN_CHEST"] as const) {
      expect(coinGroup(r)).toBe("chest");
    }
    expect(coinGroup("STREAK_WEEK")).toBe("progress");
    expect(coinGroup("LEVEL_UP")).toBe("progress");
  });

  it("стартовый баланс и покупки — не получение", () => {
    expect(coinGroup("RETRO")).toBeNull();
    expect(coinGroup("PURCHASE")).toBeNull();
  });
});

describe("coinWeeks", () => {
  // 2026-10-24 — суббота, неделя с понедельника 2026-10-19
  const today = "2026-10-24";

  it("недели с понедельника, последняя — текущая; пустые — нулями", () => {
    const weeks = coinWeeks([], today, 3);
    expect(weeks.map((w) => w.week)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(weeks.every((w) => w.total === 0 && w.workout === 0 && w.chest === 0)).toBe(true);
  });

  it("суммы раскладываются по неделям и группам", () => {
    const weeks = coinWeeks(
      [
        { week: "2026-10-19", reason: "WORKOUT", amount: 20 },
        { week: "2026-10-19", reason: "DAILY_CHEST", amount: 2 },
        { week: "2026-10-19", reason: "BOSS_CHEST", amount: 30 },
        { week: "2026-10-12", reason: "LEVEL_UP", amount: 26 },
        { week: "2026-10-12", reason: "STREAK_WEEK", amount: 14 },
        { week: "2026-10-12", reason: "RECORD", amount: 5 },
      ],
      today,
      2,
    );
    expect(weeks).toEqual([
      { week: "2026-10-12", workout: 0, record: 5, achievement: 0, chest: 0, progress: 40, total: 45 },
      { week: "2026-10-19", workout: 20, record: 0, achievement: 0, chest: 32, progress: 0, total: 52 },
    ]);
  });

  it("стартовый баланс, покупки и недели вне окна не считаются", () => {
    const weeks = coinWeeks(
      [
        { week: "2026-10-19", reason: "RETRO", amount: 3000 },
        { week: "2026-10-19", reason: "PURCHASE", amount: -150 },
        { week: "2026-09-28", reason: "WORKOUT", amount: 10 },
        { week: "2026-10-19", reason: "ACHIEVEMENT", amount: 12 },
      ],
      today,
      2,
    );
    expect(weeks.map((w) => w.total)).toEqual([0, 12]);
    expect(weeks[1].achievement).toBe(12);
  });
});

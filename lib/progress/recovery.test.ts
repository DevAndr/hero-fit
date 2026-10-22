import { describe, expect, it } from "vitest";
import { muscleRecovery, recoveryHint, recoveryHours, type GroupSession } from "./recovery";

const NOW = new Date("2026-10-08T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const byGroup = (sessions: GroupSession[], last: GroupSession[] = sessions) =>
  new Map(muscleRecovery(sessions, last, NOW).map((r) => [r.group, r]));

describe("recoveryHours", () => {
  it("крупные 72 ч, средние 60 ч, мелкие 48 ч — на 6 подходов", () => {
    expect(recoveryHours("LEGS", 6)).toBe(72);
    expect(recoveryHours("SHOULDERS", 6)).toBe(60);
    expect(recoveryHours("BICEPS", 6)).toBe(48);
  });

  it("меньше подходов — до половины нормы, больше — до 1,5 нормы", () => {
    expect(recoveryHours("BACK", 3)).toBe(36);
    expect(recoveryHours("BACK", 1)).toBe(36);
    expect(recoveryHours("BACK", 9)).toBe(108);
    expect(recoveryHours("BACK", 20)).toBe(108);
  });
});

describe("muscleRecovery", () => {
  it("все 11 групп; без тренировок — «давно не тренировалась», дней нет", () => {
    const all = muscleRecovery([], [], NOW);
    expect(all).toHaveLength(11);
    expect(all.every((r) => r.state === "neglected" && r.daysSince === null)).toBe(true);
  });

  it("процент — прошедшее / нужное время; границы состояний", () => {
    const r = byGroup([
      { group: "CHEST", sets: 6, at: hoursAgo(18) }, // 18/72 = 25 %
      { group: "BACK", sets: 6, at: hoursAgo(36) }, // 50 %
      { group: "LEGS", sets: 6, at: hoursAgo(72) }, // 100 %
    ]);
    expect(r.get("CHEST")).toMatchObject({ state: "fatigued", percent: 25, hoursLeft: 54 });
    expect(r.get("BACK")).toMatchObject({ state: "recovering", percent: 50, hoursLeft: 36 });
    expect(r.get("LEGS")).toMatchObject({ state: "ready", percent: 100, hoursLeft: 0, daysSince: 3 });
  });

  it("несколько тренировок — по самой «свежей» усталости", () => {
    const r = byGroup([
      { group: "CHEST", sets: 2, at: hoursAgo(30) }, // 30/36 = 83 %
      { group: "CHEST", sets: 9, at: hoursAgo(60) }, // 60/108 = 56 %
    ]);
    expect(r.get("CHEST")).toMatchObject({ state: "recovering", percent: 56, hoursLeft: 48, daysSince: 1 });
  });

  it("7+ дней без тренировки — «давно не тренировалась», считаются дни по последней за всё время", () => {
    const r = byGroup([], [{ group: "LEGS", sets: 6, at: hoursAgo(9 * 24 + 3) }]);
    expect(r.get("LEGS")).toMatchObject({ state: "neglected", percent: 100, daysSince: 9 });
  });
});

describe("recoveryHint", () => {
  it("тексты состояний", () => {
    const r = byGroup(
      [
        { group: "BACK", sets: 6, at: hoursAgo(43) },
        { group: "CHEST", sets: 6, at: hoursAgo(80) },
      ],
      [
        { group: "BACK", sets: 6, at: hoursAgo(43) },
        { group: "CHEST", sets: 6, at: hoursAgo(80) },
        { group: "LEGS", sets: 6, at: hoursAgo(9 * 24) },
        { group: "GLUTES", sets: 6, at: hoursAgo(9 * 24) },
      ],
    );
    expect(recoveryHint(r.get("BACK")!)).toBe("Спина: восстановление 60 %, ещё ~29 ч");
    expect(recoveryHint(r.get("CHEST")!)).toBe("Грудь: можно нагружать");
    expect(recoveryHint(r.get("LEGS")!)).toBe("Ноги отдыхают 9 дней");
    expect(recoveryHint(r.get("GLUTES")!)).toBe("Ягодицы отдыхают 9 дней");
    expect(recoveryHint(r.get("ABS")!)).toBe("Пресс: ещё не тренировали");
  });
});

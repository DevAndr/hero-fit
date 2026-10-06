import { describe, expect, it } from "vitest";
import { applyWorkoutToStreak, streakDeadline, type StreakState } from "./streak";

const H = 60 * 60 * 1000;
const t0 = new Date("2026-10-01T18:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * H);

const base: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastStreakAt: null,
  streakFreezes: 1,
  freezeGrantedAt: t0,
};

describe("applyWorkoutToStreak", () => {
  it("first workout starts a streak of 1", () => {
    const r = applyWorkoutToStreak(base, t0);
    expect(r).toMatchObject({ currentStreak: 1, longestStreak: 1, lastStreakAt: t0, extended: true });
  });

  it("another workout within 24h is the same training day", () => {
    const s = applyWorkoutToStreak(base, t0);
    const r = applyWorkoutToStreak(s, at(5));
    expect(r).toMatchObject({ currentStreak: 1, lastStreakAt: t0, extended: false });
  });

  it("workout between 24h and 48h extends the streak and starts a new window", () => {
    const s = applyWorkoutToStreak(base, t0);
    const r = applyWorkoutToStreak(s, at(30));
    expect(r).toMatchObject({ currentStreak: 2, longestStreak: 2, lastStreakAt: at(30), extended: true });
  });

  it("missing a window consumes a freeze instead of resetting", () => {
    const s = { ...applyWorkoutToStreak(base, t0), currentStreak: 5, longestStreak: 5 };
    const r = applyWorkoutToStreak(s, at(60)); // пропущено одно 24ч-окно
    expect(r).toMatchObject({ currentStreak: 6, streakFreezes: 0, usedFreezes: 1, extended: true });
  });

  it("resets to 1 when there are not enough freezes, keeping longest", () => {
    const s = { ...applyWorkoutToStreak(base, t0), currentStreak: 5, longestStreak: 7 };
    const r = applyWorkoutToStreak(s, at(24 * 4)); // пропущено 3 окна, заморозка одна
    expect(r).toMatchObject({ currentStreak: 1, longestStreak: 7, streakFreezes: 1, usedFreezes: 0, reset: true });
  });

  it("grants one freeze per week, capped at 2", () => {
    const s = { ...base, streakFreezes: 1, freezeGrantedAt: at(-24 * 8) };
    const r = applyWorkoutToStreak(s, t0);
    expect(r).toMatchObject({ streakFreezes: 2, freezeGrantedAt: t0 });

    const capped = applyWorkoutToStreak({ ...s, streakFreezes: 2 }, t0);
    expect(capped.streakFreezes).toBe(2);
  });
});

describe("streakDeadline", () => {
  it("is 48h after the last counted workout", () => {
    expect(streakDeadline(t0)).toEqual(at(48));
    expect(streakDeadline(null)).toBeNull();
  });
});

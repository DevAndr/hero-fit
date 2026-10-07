import { describe, expect, it } from "vitest";
import {
  applyWorkoutToStreak,
  restoreCost,
  restoredLastStreakAt,
  restoreOffer,
  streakDeadline,
  streakStatus,
  type StreakState,
} from "./streak";

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

describe("streakStatus", () => {
  it("no streak yet", () => {
    expect(streakStatus({ currentStreak: 0, lastStreakAt: null, streakFreezes: 1 }, t0)).toEqual({ state: "none" });
  });

  it("within 24h of the last counted workout — today is done", () => {
    const s = streakStatus({ currentStreak: 3, lastStreakAt: t0, streakFreezes: 0 }, at(5));
    expect(s).toEqual({ state: "counted", streak: 3, nextWindowAt: at(24) });
  });

  it("24–48h — must train before the deadline", () => {
    const s = streakStatus({ currentStreak: 3, lastStreakAt: t0, streakFreezes: 0 }, at(45));
    expect(s).toEqual({ state: "due", streak: 3, deadline: at(48), hoursLeft: 3 });
  });

  it("deadline passed — freezes keep it alive if enough", () => {
    expect(streakStatus({ currentStreak: 3, lastStreakAt: t0, streakFreezes: 1 }, at(50))).toMatchObject({
      state: "frozen",
      streak: 3,
      freezesNeeded: 1,
    });
    expect(streakStatus({ currentStreak: 3, lastStreakAt: t0, streakFreezes: 1 }, at(80))).toEqual({
      state: "lost",
      streak: 3,
    });
  });
});

describe("weekly freeze vs reward freezes", () => {
  it("weekly grant does not cut freezes earned from achievements", () => {
    const s = { ...base, streakFreezes: 4, freezeGrantedAt: at(-24 * 8) };
    expect(applyWorkoutToStreak(s, t0).streakFreezes).toBe(4);
  });
});

describe("restoreOffer", () => {
  const lost = { currentStreak: 12, lastStreakAt: t0, streakFreezes: 0, streakRestoredAt: null };

  it("offered within 48 h after the streak burned (lastStreakAt + 2 days + freezes)", () => {
    expect(restoreOffer(lost, at(47))).toBeNull(); // ещё не сгорела
    expect(restoreOffer(lost, at(49))).toEqual({ streak: 12, cost: restoreCost(12), expiresAt: at(48 + 48) });
    expect(restoreOffer(lost, at(96))).toBeNull(); // окно выкупа прошло
    // С заморозкой серия сгорает на сутки позже
    expect(restoreOffer({ ...lost, streakFreezes: 1 }, at(60))).toBeNull();
    expect(restoreOffer({ ...lost, streakFreezes: 1 }, at(73))?.expiresAt).toEqual(at(72 + 48));
  });

  it("not for short streaks and only once until the next workout", () => {
    expect(restoreOffer({ ...lost, currentStreak: 2 }, at(50))).toBeNull();
    expect(restoreOffer({ ...lost, streakRestoredAt: at(50) }, at(60))).toBeNull();
    // Выкупили раньше, потом тренировались (lastStreakAt новее) — снова можно
    expect(restoreOffer({ ...lost, lastStreakAt: at(10), streakRestoredAt: at(5) }, at(60))).not.toBeNull();
  });

  it("cost grows with the streak and is capped", () => {
    expect([restoreCost(3), restoreCost(7), restoreCost(30), restoreCost(200)]).toEqual([80, 120, 350, 500]);
  });

  it("after restore the streak is due — one day to train", () => {
    const now = at(60);
    const status = streakStatus({ currentStreak: 12, lastStreakAt: restoredLastStreakAt(now), streakFreezes: 0 }, now);
    expect(status).toMatchObject({ state: "due", streak: 12, hoursLeft: 24 });
  });
});

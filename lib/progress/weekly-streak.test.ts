import { describe, expect, it } from "vitest";
import {
  addWeeks,
  applyWeekCredit,
  daysLeftInWeek,
  grantFreeze,
  localHour,
  localMidnight,
  restoreCost,
  restoreOffer,
  streakFromHistory,
  streakStatus,
  streakValue,
  weekKey,
  weeklyRuns,
  weeksBetween,
  type StreakUserFields,
  type WeeklyStreakState,
} from "./weekly-streak";

describe("weekKey", () => {
  it("Monday of the week in the user's time zone", () => {
    expect(weekKey(new Date("2026-10-11T20:30:00Z"), "Europe/Moscow")).toBe("2026-10-05"); // вс 23:30 МСК
    expect(weekKey(new Date("2026-10-11T21:30:00Z"), "Europe/Moscow")).toBe("2026-10-12"); // пн 00:30 МСК
  });

  it("extreme offsets: UTC−11 and UTC+14", () => {
    expect(weekKey(new Date("2026-10-12T05:00:00Z"), "Pacific/Pago_Pago")).toBe("2026-10-05"); // вс 18:00
    expect(weekKey(new Date("2026-10-11T10:30:00Z"), "Pacific/Kiritimati")).toBe("2026-10-12"); // пн 00:30
  });

  it("Monday itself and UTC", () => {
    expect(weekKey(new Date("2026-10-05T00:00:00Z"), "UTC")).toBe("2026-10-05");
    expect(weekKey(new Date("2026-10-04T23:59:59Z"), "UTC")).toBe("2026-09-28");
  });
});

describe("week arithmetic", () => {
  it("addWeeks and weeksBetween", () => {
    expect(addWeeks("2026-10-05", -1)).toBe("2026-09-28");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(weeksBetween("2026-09-28", "2026-10-12")).toBe(2);
    expect(weeksBetween("2026-10-12", "2026-09-28")).toBe(-2);
  });

  it("weeksBetween across a DST change", () => {
    expect(weeksBetween("2026-03-23", "2026-03-30")).toBe(1);
  });
});

describe("local time", () => {
  it("localMidnight is 00:00 in the zone", () => {
    expect(localMidnight("2026-10-08", "Europe/Moscow").toISOString()).toBe("2026-10-07T21:00:00.000Z");
    expect(localMidnight("2026-10-08", "UTC").toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(localMidnight("2026-03-29", "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z"); // день перехода на летнее
  });

  it("daysLeftInWeek counts today", () => {
    expect(daysLeftInWeek(new Date("2026-10-10T15:00:00Z"), "UTC")).toBe(2); // сб
    expect(daysLeftInWeek(new Date("2026-10-05T15:00:00Z"), "UTC")).toBe(7); // пн
    expect(daysLeftInWeek(new Date("2026-10-11T15:00:00Z"), "UTC")).toBe(1); // вс
  });

  it("localHour", () => {
    expect(localHour(new Date("2026-10-10T09:30:00Z"), "Europe/Moscow")).toBe(12);
    expect(localHour(new Date("2026-10-10T23:30:00Z"), "UTC")).toBe(23);
  });
});

describe("weeklyRuns", () => {
  it("longest run of consecutive weeks and the run alive now", () => {
    const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-09-07", "2026-09-14", "2026-09-28"];
    expect(weeklyRuns(weeks, "2026-10-05")).toEqual({ best: 3, current: 1 }); // прошлая неделя ещё считается
    expect(weeklyRuns(weeks, "2026-10-12")).toEqual({ best: 3, current: 0 });
    expect(weeklyRuns([], "2026-10-05")).toEqual({ best: 0, current: 0 });
  });
});

const state = (patch: Partial<WeeklyStreakState> = {}): WeeklyStreakState => ({
  currentStreak: 0,
  longestStreak: 0,
  lastStreakWeek: null,
  streakFreezes: 0,
  freezeGrantedAt: null,
  ...patch,
});

describe("applyWeekCredit", () => {
  it("first credited week starts the streak", () => {
    expect(applyWeekCredit(state(), "2026-10-05")).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
      lastStreakWeek: "2026-10-05",
      extended: true,
      reset: false,
      frozenWeeks: [],
    });
  });

  it("the same week again changes nothing", () => {
    const s = state({ currentStreak: 3, longestStreak: 3, lastStreakWeek: "2026-10-05" });
    expect(applyWeekCredit(s, "2026-10-05")).toMatchObject({ currentStreak: 3, extended: false, reset: false });
  });

  it("a week before the last credited one (offline, back-dated) changes nothing", () => {
    const s = state({ currentStreak: 3, longestStreak: 3, lastStreakWeek: "2026-10-05" });
    expect(applyWeekCredit(s, "2026-09-28")).toMatchObject({ currentStreak: 3, lastStreakWeek: "2026-10-05", extended: false });
  });

  it("the next week extends", () => {
    const s = state({ currentStreak: 3, longestStreak: 5, lastStreakWeek: "2026-09-28" });
    expect(applyWeekCredit(s, "2026-10-05")).toMatchObject({ currentStreak: 4, longestStreak: 5, extended: true });
  });

  it("a missed week is covered by a freeze", () => {
    const s = state({ currentStreak: 3, longestStreak: 3, lastStreakWeek: "2026-09-21", streakFreezes: 1 });
    expect(applyWeekCredit(s, "2026-10-05")).toMatchObject({
      currentStreak: 4,
      longestStreak: 4,
      streakFreezes: 0,
      frozenWeeks: ["2026-09-28"],
      extended: true,
      reset: false,
    });
  });

  it("not enough freezes — the streak restarts and freezes are kept", () => {
    const s = state({ currentStreak: 6, longestStreak: 6, lastStreakWeek: "2026-09-14", streakFreezes: 1 });
    expect(applyWeekCredit(s, "2026-10-05")).toMatchObject({
      currentStreak: 1,
      longestStreak: 6,
      streakFreezes: 1,
      frozenWeeks: [],
      extended: true,
      reset: true,
    });
  });
});

describe("grantFreeze", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("one freeze every 4 weeks while below 2", () => {
    expect(grantFreeze(state({ freezeGrantedAt: ago(27) }), now)).toMatchObject({ streakFreezes: 0, freezeGrantedAt: ago(27) });
    expect(grantFreeze(state({ freezeGrantedAt: ago(28) }), now)).toMatchObject({ streakFreezes: 1, freezeGrantedAt: now });
    expect(grantFreeze(state(), now)).toMatchObject({ streakFreezes: 1, freezeGrantedAt: now });
  });

  it("does not exceed 2, does not cut reward freezes", () => {
    expect(grantFreeze(state({ streakFreezes: 2, freezeGrantedAt: ago(30) }), now)).toMatchObject({ streakFreezes: 2, freezeGrantedAt: now });
    expect(grantFreeze(state({ streakFreezes: 3, freezeGrantedAt: ago(30) }), now)).toMatchObject({ streakFreezes: 3 });
  });
});

const user = (patch: Partial<StreakUserFields & { streakRestoredAt: Date | null }> = {}) => ({
  currentStreak: 4,
  lastStreakWeek: "2026-10-05",
  streakFreezes: 0,
  weekWorkouts: 0,
  weekWorkoutsKey: null,
  freezeGrantedAt: new Date("2026-10-01T00:00:00Z"), // плановая заморозка выдана недавно
  streakRestoredAt: null,
  ...patch,
});
const MSK = "Europe/Moscow";

describe("streakStatus", () => {
  const wed = new Date("2026-10-07T12:00:00Z"); // ср, неделя 2026-10-05

  it("none without a streak", () => {
    expect(streakStatus(user({ currentStreak: 0 }), wed, MSK)).toEqual({ state: "none" });
    expect(streakStatus(user({ lastStreakWeek: null }), wed, MSK)).toEqual({ state: "none" });
  });

  it("done when this week is credited", () => {
    expect(streakStatus(user({ weekWorkouts: 3, weekWorkoutsKey: "2026-10-05" }), wed, MSK)).toEqual({ state: "done", streak: 4 });
  });

  it("Monday 00:05 after a credited week — pending, the whole week ahead", () => {
    const mon = new Date("2026-10-11T21:05:00Z"); // пн 00:05 МСК
    expect(streakStatus(user({ weekWorkouts: 3, weekWorkoutsKey: "2026-10-05" }), mon, MSK)).toEqual({
      state: "pending",
      streak: 4,
      count: 0,
      needed: 3,
      daysLeft: 7,
    });
  });

  it("counter of another week is ignored", () => {
    const s = user({ lastStreakWeek: "2026-09-28", weekWorkouts: 2, weekWorkoutsKey: "2026-09-28" });
    expect(streakStatus(s, wed, MSK)).toMatchObject({ state: "pending", count: 0, needed: 3, daysLeft: 5 });
    const t = user({ lastStreakWeek: "2026-09-28", weekWorkouts: 2, weekWorkoutsKey: "2026-10-05" });
    expect(streakStatus(t, wed, MSK)).toMatchObject({ state: "pending", count: 2, needed: 1 });
  });

  it("missed weeks: frozen while freezes suffice, then lost", () => {
    expect(streakStatus(user({ lastStreakWeek: "2026-09-21", streakFreezes: 1 }), wed, MSK)).toMatchObject({
      state: "frozen",
      streak: 4,
      freezesNeeded: 1,
    });
    expect(streakStatus(user({ lastStreakWeek: "2026-09-21", streakFreezes: 0 }), wed, MSK)).toEqual({ state: "lost", streak: 4 });
  });

  it("a freeze due on the next workout already counts (status does not flip after it is granted)", () => {
    const due = user({ lastStreakWeek: "2026-09-21", streakFreezes: 0, freezeGrantedAt: new Date("2026-09-01T00:00:00Z") });
    expect(streakStatus(due, wed, MSK)).toMatchObject({ state: "frozen", freezesNeeded: 1 });
    expect(streakStatus({ ...due, freezeGrantedAt: null }, wed, MSK)).toMatchObject({ state: "frozen" });
    expect(streakStatus({ ...due, streakFreezes: 2 }, wed, MSK)).toMatchObject({ state: "frozen" }); // лимит — без выдачи
    expect(restoreOffer(due, wed, MSK)).toBeNull(); // платить не нужно — спасёт заморозка
  });

  it("streakValue — zero for none and lost", () => {
    expect(streakValue({ state: "none" })).toBe(0);
    expect(streakValue({ state: "lost", streak: 4 })).toBe(0);
    expect(streakValue({ state: "done", streak: 4 })).toBe(4);
  });
});

describe("restore", () => {
  it("restoreCost: 50 + 50 per week, at most 500", () => {
    expect(restoreCost(2)).toBe(150);
    expect(restoreCost(12)).toBe(500);
  });

  // Последняя засчитанная — 2026-09-21, заморозок нет: 09-28 пропущена → сгорела к неделе 2026-10-05.
  const lost = user({ lastStreakWeek: "2026-09-21", currentStreak: 5 });

  it("offered in the burn week until Thursday 00:00 local time", () => {
    expect(restoreOffer(lost, new Date("2026-10-07T12:00:00Z"), MSK)).toEqual({
      streak: 5,
      cost: 300,
      expiresAt: new Date("2026-10-07T21:00:00Z"), // чт 2026-10-08 00:00 МСК
    });
    expect(restoreOffer(lost, new Date("2026-10-07T21:01:00Z"), MSK)).toBeNull();
  });

  it("not for short streaks, not a week later", () => {
    expect(restoreOffer({ ...lost, currentStreak: 1 }, new Date("2026-10-06T12:00:00Z"), MSK)).toBeNull();
    expect(restoreOffer(lost, new Date("2026-10-13T12:00:00Z"), MSK)).toBeNull();
  });

  it("burn week moves with the number of freezes", () => {
    const withFreeze = user({ lastStreakWeek: "2026-09-14", currentStreak: 5, streakFreezes: 1 });
    expect(restoreOffer(withFreeze, new Date("2026-10-06T12:00:00Z"), MSK)).toMatchObject({ streak: 5 });
  });

  it("only once until a new credited week", () => {
    const restored = user({ lastStreakWeek: "2026-09-28", currentStreak: 5, streakRestoredAt: new Date("2026-10-06T10:00:00Z") });
    // после выкупа на неделе 10-05 серия снова сгорела к 10-12 — но новой засчитанной недели не было
    expect(restoreOffer({ ...restored, lastStreakWeek: "2026-09-28" }, new Date("2026-10-13T12:00:00Z"), MSK)).toBeNull();
    const creditedAfter = user({ lastStreakWeek: "2026-10-05", currentStreak: 6, streakRestoredAt: new Date("2026-10-06T10:00:00Z") });
    expect(restoreOffer(creditedAfter, new Date("2026-10-20T12:00:00Z"), MSK)).toMatchObject({ streak: 6 });
  });
});

describe("streakFromHistory", () => {
  it("weeks with 3+ workouts form the streak; this week's counter is kept", () => {
    const rows = [
      { week: "2026-09-07", workouts: 3 },
      { week: "2026-09-14", workouts: 5 },
      { week: "2026-09-21", workouts: 2 }, // недобор — разрыв
      { week: "2026-09-28", workouts: 3 },
      { week: "2026-10-05", workouts: 1 },
    ];
    expect(streakFromHistory(rows, "2026-10-05")).toEqual({
      currentStreak: 1,
      longestStreak: 2,
      lastStreakWeek: "2026-09-28",
      weekWorkouts: 1,
      weekWorkoutsKey: "2026-10-05",
    });
  });

  it("no history", () => {
    expect(streakFromHistory([], "2026-10-05")).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      lastStreakWeek: null,
      weekWorkouts: 0,
      weekWorkoutsKey: "2026-10-05",
    });
  });
});

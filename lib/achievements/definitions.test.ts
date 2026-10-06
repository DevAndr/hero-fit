import { describe, expect, it } from "vitest";
import {
  earnedAchievements,
  nextGoals,
  STREAK_THRESHOLDS,
  thresholdsUpTo,
  type AchievementStats,
} from "./definitions";

const empty: AchievementStats = {
  workouts: 0,
  longestStreak: 0,
  currentStreak: 0,
  loginStreak: 0,
  exercises: [],
};

const codes = (stats: AchievementStats) => earnedAchievements(stats).map((a) => a.code);

describe("thresholdsUpTo", () => {
  it("lists fixed thresholds, then continues with a step", () => {
    expect(thresholdsUpTo(STREAK_THRESHOLDS, 50, 20)).toEqual([3, 7, 14]);
    expect(thresholdsUpTo(STREAK_THRESHOLDS, 50, 210)).toEqual([3, 7, 14, 30, 60, 100, 150, 200]);
  });
});

describe("earnedAchievements", () => {
  it("nothing for a new user", () => {
    expect(earnedAchievements(empty)).toEqual([]);
  });

  it("workout count — every multiple of 5", () => {
    expect(codes({ ...empty, workouts: 4 })).toEqual([]);
    expect(codes({ ...empty, workouts: 17 })).toEqual(["workouts:5", "workouts:10", "workouts:15"]);
  });

  it("streak achievements use the longest streak (kept after a break)", () => {
    expect(codes({ ...empty, longestStreak: 8, currentStreak: 1 })).toEqual(["streak:3", "streak:7"]);
  });

  it("daily login streak", () => {
    expect(codes({ ...empty, loginStreak: 14 })).toEqual(["login:3", "login:7", "login:14"]);
  });

  it("weight progress per exercise relative to the first workout", () => {
    const stats = {
      ...empty,
      exercises: [
        { id: "bench", name: "Жим", baseline: 60, best: 80, maxSetsInWorkout: 3 }, // +33%
        { id: "bw", name: "Подтягивания", baseline: 0, best: 0, maxSetsInWorkout: 4 },
      ],
    };
    expect(codes(stats)).toEqual(["weight:bench:10", "weight:bench:25"]);
  });

  it("more than 4 sets in one workout → sets achievement per exercise", () => {
    const stats = {
      ...empty,
      exercises: [
        { id: "a", name: "A", baseline: 0, best: 0, maxSetsInWorkout: 5 },
        { id: "b", name: "B", baseline: 0, best: 0, maxSetsInWorkout: 4 },
      ],
    };
    expect(codes(stats)).toEqual(["sets:a"]);
  });

  it("every achievement has a title, description and positive XP", () => {
    const all = earnedAchievements({
      workouts: 100,
      longestStreak: 100,
      currentStreak: 100,
      loginStreak: 365,
      exercises: [{ id: "x", name: "X", baseline: 50, best: 100, maxSetsInWorkout: 6 }],
    });
    for (const a of all) {
      expect(a.title).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.xpReward).toBeGreaterThan(0);
    }
    expect(new Set(all.map((a) => a.code)).size).toBe(all.length);
  });
});

describe("nextGoals", () => {
  it("shows the next threshold in each category with progress, closest first", () => {
    const goals = nextGoals({ ...empty, workouts: 8, currentStreak: 2, loginStreak: 1 });
    expect(goals.map((g) => g.code).slice(0, 3)).toEqual(["workouts:10", "streak:3", "login:3"]);
    expect(goals[0]).toMatchObject({ current: 8, target: 10, percent: 80 });
    expect(goals[1]).toMatchObject({ current: 2, target: 3, percent: 66 });
  });

  it("weight goal is the closest next percentage for any exercise", () => {
    const goals = nextGoals({
      ...empty,
      exercises: [{ id: "bench", name: "Жим", baseline: 100, best: 120, maxSetsInWorkout: 3 }],
    });
    expect(goals.find((g) => g.category === "WEIGHT_PROGRESS")).toMatchObject({
      code: "weight:bench:25",
      current: 20,
      target: 25,
      percent: 80,
    });
  });
});

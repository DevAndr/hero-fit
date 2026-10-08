import { describe, expect, it } from "vitest";
import {
  EMPTY_STATS,
  earnedAchievements,
  nextGoals,
  thresholdsUpTo,
  type AchievementStats,
} from "./definitions";
import { STREAK_WEEK_THRESHOLDS } from "@/lib/progress/weekly-streak";

const empty = EMPTY_STATS;

const codes = (stats: AchievementStats) => earnedAchievements(stats).map((a) => a.code);
const codesOf = (prefix: string, stats: Partial<AchievementStats>) =>
  codes({ ...empty, ...stats }).filter((c) => c.startsWith(`${prefix}:`));

describe("thresholdsUpTo", () => {
  it("lists fixed thresholds, then continues with a step", () => {
    expect(thresholdsUpTo(STREAK_WEEK_THRESHOLDS, 52, 10)).toEqual([2, 4, 8]);
    expect(thresholdsUpTo(STREAK_WEEK_THRESHOLDS, 52, 160)).toEqual([2, 4, 8, 12, 26, 52, 104, 156]);
  });

  it("without a step — only the fixed thresholds", () => {
    expect(thresholdsUpTo([10, 25], undefined, 1000)).toEqual([10, 25]);
  });
});

describe("earnedAchievements", () => {
  it("nothing for a new user", () => {
    expect(earnedAchievements(empty)).toEqual([]);
  });

  it("workout count — the first one, then every multiple of 5", () => {
    expect(codes({ ...empty, workouts: 4 })).toEqual(["workouts:1"]);
    expect(codes({ ...empty, workouts: 17 })).toEqual(["workouts:1", "workouts:5", "workouts:10", "workouts:15"]);
    expect(earnedAchievements({ ...empty, workouts: 1 })[0]).toMatchObject({ title: "Первая тренировка", xpReward: 21 });
  });

  it("3 workouts in a week — once, with the first credited week", () => {
    expect(codesOf("weekgoal", { weekWorkouts: 2 })).toEqual([]);
    expect(codesOf("weekgoal", { longestStreak: 1 })).toEqual(["weekgoal:3"]);
    expect(codesOf("weekgoal", { longestStreak: 30 })).toEqual(["weekgoal:3"]);
    expect(earnedAchievements({ ...empty, longestStreak: 1 })[0]).toMatchObject({ title: "3 тренировки в неделю", category: "STREAK" });
    // Цель — тренировки текущей недели
    expect(nextGoals({ ...empty, weekWorkouts: 2 }).find((g) => g.code === "weekgoal:3")).toMatchObject({ current: 2, target: 3 });
  });

  it("weekly streak achievements use the longest streak (kept after a break)", () => {
    expect(codesOf("streakw", { longestStreak: 9, currentStreak: 1 })).toEqual(["streakw:2", "streakw:4", "streakw:8"]);
    expect(codesOf("streakw", { longestStreak: 104 })).toContain("streakw:104");
  });

  it("no more day-streak or «Стабильность» codes", () => {
    const all = codes({ ...empty, longestStreak: 60, currentStreak: 60 });
    expect(all.filter((c) => c.startsWith("streak:") || c.startsWith("weeks:"))).toEqual([]);
  });

  it("weekly streak of 4+ and 30+ login days reward a streak freeze", () => {
    const all = earnedAchievements({ ...empty, longestStreak: 4, loginStreak: 30 });
    const reward = Object.fromEntries(all.map((a) => [a.code, a.freezeReward ?? 0]));
    expect(reward).toMatchObject({ "streakw:2": 0, "streakw:4": 1, "login:14": 0, "login:30": 1 });
    const four = all.find((a) => a.code === "streakw:4");
    expect(four).toMatchObject({ title: "Месяц огня", xpReward: 60 });
    expect(four?.description).toBe("Тренироваться 3+ раза в неделю 4 недели подряд · награда: заморозка серии");
    expect(all.find((a) => a.code === "streakw:2")?.title).toBe("В ударе");
  });

  it("daily login streak", () => {
    expect(codes({ ...empty, loginStreak: 14 })).toEqual(["login:3", "login:7", "login:14"]);
  });

  it("weight progress — every +5 kg over the first workout", () => {
    const stats = {
      ...empty,
      exercises: [
        { id: "bench", name: "Жим", baseline: 60, best: 77.5, maxSetsInWorkout: 3 }, // +17,5 кг
        { id: "squat", name: "Присед", baseline: 100, best: 104.5, maxSetsInWorkout: 3 }, // +4,5 кг — ещё нет
        { id: "bw", name: "Подтягивания", baseline: 0, best: 0, maxSetsInWorkout: 4 },
      ],
    };
    expect(codes(stats)).toEqual(["weightkg:bench:5", "weightkg:bench:10", "weightkg:bench:15"]);
    expect(earnedAchievements(stats)[2]).toMatchObject({ title: "Жим: +15 кг", xpReward: 30 });
  });

  it("weight progress handles fractional plates exactly at the step", () => {
    const stats = { ...empty, exercises: [{ id: "x", name: "X", baseline: 42.5, best: 52.5, maxSetsInWorkout: 1 }] };
    expect(codes(stats)).toEqual(["weightkg:x:5", "weightkg:x:10"]);
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

  it("volume: total tonnes (named), tonnes in one workout, total reps", () => {
    expect(codesOf("volume", { totalVolumeKg: 4999 })).toEqual([]);
    expect(codesOf("volume", { totalVolumeKg: 12_000 })).toEqual(["volume:5", "volume:10"]);
    expect(codesOf("volume", { totalVolumeKg: 2_100_000 })).toEqual([
      "volume:5", "volume:10", "volume:50", "volume:100", "volume:400", "volume:1000", "volume:2000",
    ]);
    expect(earnedAchievements({ ...empty, totalVolumeKg: 5000 })[0].title).toBe("Поднял слона");
    expect(codesOf("workoutvolume", { maxWorkoutVolumeKg: 10_500 })).toEqual(["workoutvolume:5", "workoutvolume:10"]);
    expect(codesOf("reps", { totalReps: 21_000 })).toEqual(["reps:1000", "reps:5000", "reps:10000", "reps:20000"]);
  });

  it("records: count of broken PRs and 3+ PRs in one workout", () => {
    expect(codesOf("records", { prCount: 12 })).toEqual(["records:1", "records:10"]);
    expect(codesOf("prday", { maxPrsInWorkout: 2 })).toEqual([]);
    expect(codesOf("prday", { maxPrsInWorkout: 3 })).toEqual(["prday:3"]);
  });

  it("strength: round weights in base lifts and 1RM relative to body weight", () => {
    const lifts = { bench: { maxWeight: 100, oneRm: 112 }, deadlift: { maxWeight: 150, oneRm: 170 } };
    expect(codesOf("lift", { lifts })).toEqual([
      "lift:bench:60", "lift:bench:80", "lift:bench:100", "lift:deadlift:100", "lift:deadlift:140",
    ]);
    expect(earnedAchievements({ ...empty, lifts }).find((a) => a.code === "lift:bench:100")?.title).toBe(
      "Клуб сотки: жим лёжа",
    );
    // Без веса тела ачивок «к весу тела» нет
    expect(codesOf("bwratio", { lifts })).toEqual([]);
    // 112 / 80 = ×1,4; становая 170 / 80 = ×2,125
    const withBw = earnedAchievements({ ...empty, lifts, bodyWeight: 80 }).filter((a) => a.code.startsWith("bwratio:"));
    expect(withBw.map((a) => a.code)).toEqual(["bwratio:bench:100", "bwratio:bench:125", "bwratio:deadlift:200"]);
    expect(withBw[1].title).toBe("Жим лёжа: ×1,25 веса тела");
  });

  it("variety: distinct exercises, per muscle group, all groups in a week, own exercise", () => {
    expect(codesOf("exercises", { distinctExercises: 26 })).toEqual(["exercises:10", "exercises:25"]);
    expect(codesOf("muscle", { muscleWorkouts: { CHEST: 52, CALVES: 9 } })).toEqual(["muscle:CHEST:10", "muscle:CHEST:50"]);
    expect(codesOf("allgroups", { maxGroupsInWeek: 9 })).toEqual([]);
    expect(codesOf("allgroups", { maxGroupsInWeek: 10 })).toEqual(["allgroups:10"]);
    expect(codesOf("custom-exercise", { customExercises: 2 })).toEqual(["custom-exercise:1"]);
  });

  it("time: hours, marathon, express, early bird / night owl, weekly consistency", () => {
    expect(codesOf("hours", { totalSec: 51 * 3600 })).toEqual(["hours:10", "hours:50"]);
    expect(codesOf("marathon", { longestWorkoutSec: 89 * 60 })).toEqual([]);
    expect(codesOf("marathon", { longestWorkoutSec: 90 * 60 })).toEqual(["marathon:90"]);
    expect(codesOf("express", { expressWorkouts: 1 })).toEqual(["express:1"]);
    expect(codesOf("early", { earlyWorkouts: 5 })).toEqual(["early:5"]);
    expect(codesOf("late", { lateWorkouts: 25 })).toEqual(["late:5", "late:25"]);
  });

  it("programs: own template and workouts by a ready-made program", () => {
    expect(codesOf("template", { customTemplates: 1 })).toEqual(["template:1"]);
    const programs = [{ program: "5×5", workouts: 12 }, { program: "Full Body", workouts: 3 }];
    expect(codesOf("program", { programs })).toEqual(["program:5×5:10"]);
  });

  it("milestones: level, collector, comeback after a break, streak saved by a freeze", () => {
    expect(codesOf("level", { level: 12 })).toEqual(["level:5", "level:10"]);
    expect(codesOf("collector", { achievements: 25 })).toEqual(["collector:10", "collector:25"]);
    expect(codesOf("comeback", { maxGapDays: 13.9 })).toEqual([]);
    expect(codesOf("comeback", { maxGapDays: 20 })).toEqual(["comeback:14"]);
    expect(codesOf("freeze", { freezeSaves: 1 })).toEqual(["freeze:1"]);
  });

  it("league: wins ladder, silver and bronze once", () => {
    expect(codes({ ...empty, leaguePlaces: { 1: 0, 2: 0, 3: 0 } })).toEqual([]);
    expect(codes({ ...empty, leaguePlaces: { 1: 6, 2: 3, 3: 1 } })).toEqual(["league1:1", "league1:5", "league2:1", "league3:1"]);
    expect(codesOf("league1", { leaguePlaces: { 1: 60, 2: 0, 3: 0 } })).toEqual([
      "league1:1",
      "league1:5",
      "league1:10",
      "league1:25",
      "league1:50",
    ]);
    const first = earnedAchievements({ ...empty, leaguePlaces: { 1: 1, 2: 0, 3: 0 } })[0];
    expect(first).toMatchObject({ title: "Чемпион лиги", category: "LEAGUE", xpReward: 50 });
    // Цель по победам — только после первой
    expect(nextGoals(empty).some((g) => g.code.startsWith("league"))).toBe(false);
    expect(nextGoals({ ...empty, leaguePlaces: { 1: 2, 2: 0, 3: 0 } }).find((g) => g.code.startsWith("league1:"))).toMatchObject({
      title: "Чемпион лиги ×5",
      current: 2,
    });
  });

  it("every achievement has a title, description, positive integer XP and a unique code", () => {
    const all = earnedAchievements({
      ...empty,
      workouts: 100,
      longestStreak: 100,
      currentStreak: 100,
      loginStreak: 365,
      exercises: [{ id: "x", name: "X", baseline: 50, best: 100, maxSetsInWorkout: 6 }],
      level: 60,
      achievements: 120,
      totalVolumeKg: 3_000_000,
      maxWorkoutVolumeKg: 30_000,
      totalReps: 50_000,
      prCount: 300,
      maxPrsInWorkout: 5,
      lifts: {
        bench: { maxWeight: 200, oneRm: 220 },
        squat: { maxWeight: 300, oneRm: 330 },
        deadlift: { maxWeight: 350, oneRm: 380 },
      },
      bodyWeight: 90,
      distinctExercises: 60,
      customExercises: 3,
      muscleWorkouts: { CHEST: 200, BACK: 150 },
      maxGroupsInWeek: 10,
      totalSec: 2000 * 3600,
      longestWorkoutSec: 3 * 3600,
      expressWorkouts: 2,
      earlyWorkouts: 30,
      lateWorkouts: 30,
      customTemplates: 2,
      programs: [{ program: "5×5", workouts: 60 }],
      maxGapDays: 30,
      freezeSaves: 2,
      leaguePlaces: { 1: 30, 2: 4, 3: 2 },
    });
    for (const a of all) {
      expect(a.title).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.xpReward).toBeGreaterThan(0);
      expect(Number.isInteger(a.xpReward)).toBe(true);
      expect(Number.isInteger(a.threshold)).toBe(true);
    }
    expect(new Set(all.map((a) => a.code)).size).toBe(all.length);
  });
});

describe("nextGoals", () => {
  it("shows the next threshold in each category with progress, closest first", () => {
    const goals = nextGoals({ ...empty, workouts: 8, currentStreak: 1, loginStreak: 1 });
    expect(goals.map((g) => g.code).slice(0, 3)).toEqual(["workouts:10", "streakw:2", "login:3"]);
    expect(goals[0]).toMatchObject({ current: 8, target: 10, percent: 80 });
    expect(goals[1]).toMatchObject({ current: 1, target: 2, percent: 50 });
  });

  it("weight goal is the next +5 kg step of the closest exercise", () => {
    const goals = nextGoals({
      ...empty,
      exercises: [
        { id: "bench", name: "Жим", baseline: 100, best: 124, maxSetsInWorkout: 3 },
        { id: "squat", name: "Присед", baseline: 100, best: 101, maxSetsInWorkout: 3 },
      ],
    });
    expect(goals.filter((g) => g.category === "WEIGHT_PROGRESS")).toEqual([
      expect.objectContaining({ code: "weightkg:bench:25", current: 24, target: 25, percent: 96, unit: " кг" }),
    ]);
  });

  it("one goal per family; one-off achievements have no goal", () => {
    const goals = nextGoals({
      ...empty,
      totalVolumeKg: 7_300,
      totalSec: 4 * 3600,
      muscleWorkouts: { CHEST: 8, LEGS: 3 },
      groupsThisWeek: 6,
      maxGroupsInWeek: 8,
    });
    expect(goals.find((g) => g.code === "volume:10")).toMatchObject({ current: 7.3, target: 10, unit: " т" });
    expect(goals.find((g) => g.code === "hours:10")).toMatchObject({ current: 4, unit: " ч" });
    expect(goals.filter((g) => g.code.startsWith("muscle:")).map((g) => g.code)).toEqual(["muscle:CHEST:10"]);
    // «Все группы за неделю» — прогресс по текущей неделе
    expect(goals.find((g) => g.code === "allgroups:10")).toMatchObject({ current: 6, target: 10 });
    expect(goals.some((g) => /^(marathon|express|comeback|freeze|prday|early|late|template|custom-exercise):/.test(g.code))).toBe(
      false,
    );
  });

  it("body weight goal appears only when body weight is set", () => {
    const lifts = { bench: { maxWeight: 70, oneRm: 80 } };
    expect(nextGoals({ ...empty, lifts }).some((g) => g.code.startsWith("bwratio:"))).toBe(false);
    expect(nextGoals({ ...empty, lifts, bodyWeight: 100 }).find((g) => g.code.startsWith("bwratio:"))).toMatchObject({
      code: "bwratio:bench:100",
      current: 80,
      target: 100,
      unit: "%",
    });
  });
});

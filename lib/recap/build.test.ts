import { describe, expect, it } from "vitest";
import type { FinishMeta } from "@/lib/workouts/finish";
import { buildRecap, recapHighlights, recapPushBody } from "./build";
import type { RecapData, RecapInput } from "./types";

const WEEK = "2026-10-05";

const meta = (m: Partial<FinishMeta> = {}): FinishMeta => ({
  xpBefore: 0,
  levelBefore: 3,
  levelAfter: 3,
  workoutXp: 80,
  recordsXp: 0,
  achievementsXp: 0,
  records: [],
  achievements: [],
  streak: 1,
  streakExtended: false,
  streakReset: false,
  usedFreezes: 0,
  weekCount: 1,
  ...m,
});

const set = (exerciseName: string, weight: number, reps: number, isBodyweight = false) => ({
  exerciseId: exerciseName.toLowerCase(),
  exerciseName,
  isBodyweight,
  weight,
  reps,
});

const input = (o: Partial<RecapInput> = {}): RecapInput => ({
  week: WEEK,
  workouts: [{ minutes: 60, volume: 5000, sets: 20, finishedAt: new Date("2026-10-06T18:00:00Z") }],
  prevWorkouts: [],
  sets: [set("Жим", 100, 5)],
  league: null,
  percentile: { value: null, xp: 80 },
  finishMetas: [meta()],
  coveredByFreeze: false,
  streakAtWeekEnd: 1,
  achievements: [],
  muscleSets: [],
  plan: null,
  ...o,
});

const w = (minutes: number, volume: number, sets: number) => ({ minutes, volume, sets, finishedAt: new Date("2026-10-06T18:00:00Z") });

describe("buildRecap", () => {
  it("returns null without workouts", () => {
    expect(buildRecap(input({ workouts: [] }))).toBeNull();
  });

  it("totals with previous week", () => {
    const r = buildRecap(
      input({
        workouts: [w(60, 5000, 20), w(45, 4000, 15), w(50, 3000, 18)],
        prevWorkouts: [
          { minutes: 40, volume: 4000, sets: 12 },
          { minutes: 50, volume: 6000, sets: 14 },
        ],
      }),
    )!;
    expect(r.version).toBe(1);
    expect(r.week).toBe(WEEK);
    expect(r.totals).toEqual({ workouts: 3, minutes: 155, volume: 12000, sets: 53, prev: { workouts: 2, minutes: 90, volume: 10000, sets: 26 } });
  });

  it("prev is null for empty previous week", () => {
    expect(buildRecap(input())!.totals.prev).toBeNull();
  });

  it("bestSet by Epley", () => {
    const r = buildRecap(input({ sets: [set("Присед", 110, 1), set("Жим", 100, 5)] }))!;
    expect(r.bestSet).toMatchObject({ exerciseName: "Жим", weight: 100, reps: 5, isRecord: false });
    expect(r.bestSet!.e1rm).toBeCloseTo(116.67, 2);
  });

  it("bestSet tie → heavier", () => {
    const r = buildRecap(input({ sets: [set("Тяга", 90, 10), set("Жим", 100, 6)] }))!;
    expect(r.bestSet).toMatchObject({ exerciseName: "Жим", weight: 100, reps: 6 });
  });

  it("bestSet skips zero weight on weighted exercise", () => {
    expect(buildRecap(input({ sets: [set("Жим", 0, 10)] }))!.bestSet).toBeUndefined();
  });

  it("bodyweight bestSet only without weighted sets", () => {
    const bw = [set("Подтягивания", 0, 12, true), set("Подтягивания", 0, 15, true)];
    expect(buildRecap(input({ sets: bw }))!.bestSet).toMatchObject({ exerciseName: "Подтягивания", weight: 0, reps: 15, e1rm: null });
    expect(buildRecap(input({ sets: [...bw, set("Жим", 60, 8)] }))!.bestSet).toMatchObject({ exerciseName: "Жим" });
  });

  it("bestSet.isRecord from week records", () => {
    const records = [{ exerciseId: "жим", exerciseName: "Жим", type: "MAX_WEIGHT" as const, value: 100, previous: 95 }];
    expect(buildRecap(input({ finishMetas: [meta({ records })] }))!.bestSet!.isRecord).toBe(true);
    const oneRm = [{ exerciseId: "жим", exerciseName: "Жим", type: "ONE_RM" as const, value: 116.666, previous: 110 }];
    expect(buildRecap(input({ finishMetas: [meta({ records: oneRm })] }))!.bestSet!.isRecord).toBe(true);
    const other = [{ exerciseId: "присед", exerciseName: "Присед", type: "MAX_WEIGHT" as const, value: 100, previous: 95 }];
    expect(buildRecap(input({ finishMetas: [meta({ records: other })] }))!.bestSet!.isRecord).toBe(false);
  });

  it("league with friends", () => {
    const r = buildRecap(
      input({
        league: {
          meId: "me",
          members: [
            { id: "me", nickname: "Я", xp: 300, workouts: 2 },
            { id: "a", nickname: "A", xp: 500, workouts: 3 },
            { id: "b", nickname: "B", xp: 100, workouts: 1 },
          ],
        },
      }),
    )!;
    expect(r.league).toEqual({
      place: 2,
      of: 3,
      xp: 300,
      rows: [
        { nickname: "A", xp: 500, place: 1, me: false },
        { nickname: "Я", xp: 300, place: 2, me: true },
        { nickname: "B", xp: 100, place: 3, me: false },
      ],
    });
  });

  it("league rows: top-3 plus me and neighbours", () => {
    const members = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, nickname: `U${i}`, xp: 1000 - i * 10, workouts: 1 }));
    const r = buildRecap(input({ league: { meId: "u6", members } }))!;
    const league = r.league as { place: number; rows: { place: number }[] };
    expect(league.place).toBe(7);
    expect(league.rows.map((row) => row.place)).toEqual([1, 2, 3, 6, 7, 8]);
  });

  it("league percentile without friends", () => {
    expect(buildRecap(input({ percentile: { value: 80, xp: 120 } }))!.league).toEqual({ percentile: 80, xp: 120 });
    expect(buildRecap(input({ percentile: { value: null, xp: 120 } }))!.league).toBeUndefined();
  });

  it("streak: credited week shows the series as of that week", () => {
    const r = buildRecap(input({ finishMetas: [meta({ weekCount: 2, streak: 6 }), meta({ weekCount: 3, streak: 7 })], streakAtWeekEnd: 9 }))!;
    expect(r.streak).toEqual({ weekCount: 3, target: 3, credited: true, streak: 7, frozen: false });
  });

  it("streak: uncredited week shows the series alive at the end of the week", () => {
    const r = buildRecap(input({ finishMetas: [meta({ weekCount: 1, streak: 6 })], streakAtWeekEnd: 0 }))!;
    expect(r.streak).toMatchObject({ weekCount: 1, credited: false, streak: 0 });
    expect(buildRecap(input({ coveredByFreeze: true }))!.streak!.frozen).toBe(true);
  });

  it("records: PRs, achievements, level", () => {
    const pr = { exerciseId: "жим", exerciseName: "Жим", type: "MAX_WEIGHT" as const, value: 100, previous: 95 };
    const r = buildRecap(
      input({
        finishMetas: [meta({ levelBefore: 7, levelAfter: 8, records: [pr] }), meta({ levelBefore: 8, levelAfter: 9 })],
        achievements: [{ code: "workouts:10", title: "Десятка" }],
      }),
    )!;
    expect(r.records).toEqual({
      prs: [{ exerciseId: "жим", exerciseName: "Жим", type: "MAX_WEIGHT", value: 100 }],
      achievements: [{ code: "workouts:10", title: "Десятка" }],
      level: { from: 7, to: 9 },
    });
    expect(buildRecap(input())!.records).toBeUndefined();
  });

  it("muscles: groups of the week and forgotten group", () => {
    const r = buildRecap(
      input({
        muscleSets: [
          { group: "CHEST", week: WEEK, sets: 8 },
          { group: "BICEPS", week: WEEK, sets: 4 },
          { group: "LEGS", week: "2026-09-14", sets: 6 },
          { group: "BACK", week: "2026-09-07", sets: 2 },
          { group: "SHOULDERS", week: "2026-09-28", sets: 3 },
          { group: "SHOULDERS", week: "2026-09-14", sets: 9 },
        ],
      }),
    )!;
    expect(r.muscles).toEqual({
      groups: [
        { group: "CHEST", sets: 8 },
        { group: "BICEPS", sets: 4 },
      ],
      forgotten: "LEGS",
    });
  });

  it("plan", () => {
    expect(buildRecap(input({ plan: { done: 3, planned: 4 } }))!.plan).toEqual({ done: 3, planned: 4 });
    expect(buildRecap(input())!.plan).toBeUndefined();
  });
});

describe("recapPushBody", () => {
  const base = (o: Partial<RecapData> = {}): RecapData => ({
    version: 1,
    week: WEEK,
    totals: { workouts: 3, minutes: 150, volume: 12000, sets: 50, prev: { workouts: 2, minutes: 120, volume: 10170, sets: 40 } },
    ...o,
  });
  const press = { exerciseId: "p", exerciseName: "Жим лёжа", weight: 100, reps: 5, e1rm: 116.7, isRecord: false };
  const league = { place: 2, of: 3, xp: 300, rows: [] };

  it("league place, volume growth and best set", () => {
    expect(recapPushBody(base({ league, bestSet: press }))).toBe("2-е место в лиге · объём +18% · лучший подход: Жим лёжа 100×5");
  });

  it("workouts growth when volume fell", () => {
    const data = base({ bestSet: press, totals: { workouts: 3, minutes: 100, volume: 8000, sets: 30, prev: { workouts: 2, minutes: 90, volume: 9000, sets: 30 } } });
    expect(recapPushBody(data)).toBe("тренировок +1 · лучший подход: Жим лёжа 100×5");
  });

  it("credited week without growth", () => {
    const streak = { weekCount: 3, target: 3, credited: true, streak: 4, frozen: false };
    const data = base({ bestSet: press, streak, totals: { workouts: 3, minutes: 100, volume: 8000, sets: 30, prev: null } });
    expect(recapPushBody(data)).toBe("лучший подход: Жим лёжа 100×5 · неделя засчитана 🔥");
  });

  it("at most three facts", () => {
    const streak = { weekCount: 3, target: 3, credited: true, streak: 4, frozen: false };
    expect(recapHighlights(base({ league, bestSet: press, streak }))).toHaveLength(3);
  });

  it("fallback fact", () => {
    expect(recapPushBody(base({ totals: { workouts: 1, minutes: 40, volume: 0, sets: 5, prev: null } }))).toBe("1 тренировка за неделю");
  });

  it("bodyweight best set", () => {
    const pullups = { exerciseId: "u", exerciseName: "Подтягивания", weight: 0, reps: 15, e1rm: null, isRecord: false };
    expect(recapPushBody(base({ bestSet: pullups, totals: { workouts: 2, minutes: 60, volume: 0, sets: 10, prev: null } }))).toBe(
      "лучший подход: Подтягивания ×15",
    );
  });

  it("percentile league is not a push fact", () => {
    expect(recapHighlights(base({ league: { percentile: 80, xp: 100 } }))[0]).toBe("объём +18%");
  });
});

describe("boss block", () => {
  it("босс недели — как есть; без босса — блока нет", () => {
    const boss = { code: "golem", hp: 1500, damage: 1100, defeatedAt: null };
    expect(buildRecap(input({ boss }))?.boss).toEqual(boss);
    const won = { code: "troll", hp: 1800, damage: 1900, defeatedAt: "2026-10-07T15:00:00.000Z" };
    expect(buildRecap(input({ boss: won }))?.boss).toEqual(won);
    expect(buildRecap(input({ boss: null }))).not.toHaveProperty("boss");
  });
});

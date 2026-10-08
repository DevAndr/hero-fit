import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, kudosLabel, streakMilestone, toFeedEntry, type FeedRow } from "./feed";

const row = (patch: Partial<FeedRow> = {}): FeedRow => ({
  id: "w1",
  userId: "owner",
  nickname: "Маша",
  titleCode: null,
  hideWeights: false,
  name: "Push",
  finishedAt: new Date("2026-10-07T10:00:00Z"),
  durationSec: 3120,
  totalVolume: 6200,
  totalSets: 15,
  totalReps: 120,
  exercises: [
    { name: "Жим лёжа", top: 100 },
    { name: "Отжимания на брусьях", top: 0 },
    { name: "Жим стоя", top: 50 },
    { name: "Махи", top: 12 },
  ],
  meta: {
    records: [
      { exerciseName: "Жим лёжа", type: "MAX_WEIGHT", value: 100 },
      { exerciseName: "Отжимания на брусьях", type: "MAX_REPS", value: 20 },
    ],
    achievements: [
      { code: "lift:bench:100", title: "Клуб сотки: жим лёжа" },
      { code: "login:7", title: "Неделя в игре" },
    ],
    levelBefore: 7,
    levelAfter: 8,
    streak: 4,
    streakExtended: true,
    weekCount: 3,
  },
  kudos: 0,
  byMe: false,
  kudosNames: null,
  ...patch,
});

describe("toFeedEntry", () => {
  it("summarizes a workout: top exercises, PRs, achievements without daily-login noise, level up, streak milestone", () => {
    const e = toFeedEntry(row(), "viewer");
    expect(e).toMatchObject({ me: false, volume: 6200, durationSec: 3120, moreExercises: 1, levelUp: 8, streakMilestone: 4 });
    expect(e.exercises).toEqual([
      { name: "Жим лёжа", top: 100 },
      { name: "Отжимания на брусьях", top: null }, // без веса
      { name: "Жим стоя", top: 50 },
    ]);
    expect(e.achievements).toEqual(["Клуб сотки: жим лёжа"]);
    expect(e.records[0]).toEqual({ exerciseName: "Жим лёжа", type: "MAX_WEIGHT", value: 100 });
  });

  it("hideWeights: viewers get no volume, exercise weights or weight PR values; reps PR stays", () => {
    const e = toFeedEntry(row({ hideWeights: true }), "viewer");
    expect(e.volume).toBeNull();
    expect(e.exercises.every((x) => x.top === null)).toBe(true);
    expect(e.records).toEqual([
      { exerciseName: "Жим лёжа", type: "MAX_WEIGHT", value: null },
      { exerciseName: "Отжимания на брусьях", type: "MAX_REPS", value: 20 },
    ]);
    // Длительность и количество — видны
    expect(e).toMatchObject({ durationSec: 3120, sets: 15, reps: 120 });
    // Свои веса автор видит всегда
    expect(toFeedEntry(row({ hideWeights: true }), "owner")).toMatchObject({ me: true, volume: 6200 });
  });

  it("works for history without a finish summary (seeded / old workouts)", () => {
    const e = toFeedEntry(row({ meta: null, exercises: null, durationSec: null }), "viewer");
    expect(e).toMatchObject({ records: [], achievements: [], levelUp: null, streakMilestone: null, exercises: [], durationSec: 0 });
  });
});

describe("streakMilestone", () => {
  it("only when this workout credited a week onto a threshold (in weeks)", () => {
    expect(streakMilestone({ streak: 4, streakExtended: true, weekCount: 3 })).toBe(4);
    expect(streakMilestone({ streak: 7, streakExtended: true, weekCount: 3 })).toBeNull();
    expect(streakMilestone({ streak: 4, streakExtended: false, weekCount: 4 })).toBeNull(); // 4-я тренировка той же недели
    expect(streakMilestone({ streak: 104, streakExtended: true, weekCount: 3 })).toBe(104);
    expect(streakMilestone({ streak: 100, streakExtended: true, weekCount: 3 })).toBeNull();
  });

  it("old day-based meta (no weekCount) is not a weekly milestone", () => {
    expect(streakMilestone({ streak: 4, streakExtended: true })).toBeNull();
  });
});

describe("kudosLabel", () => {
  it("names up to two people, the rest as a count", () => {
    expect(kudosLabel({ count: 0, byMe: false, names: [] })).toBe("");
    expect(kudosLabel({ count: 1, byMe: true, names: [] })).toBe("Вы");
    expect(kudosLabel({ count: 2, byMe: false, names: ["Маша", "Борис"] })).toBe("Маша и Борис");
    expect(kudosLabel({ count: 4, byMe: true, names: ["Маша", "Борис"] })).toBe("Вы, Маша и ещё 2");
  });
});

describe("cursor", () => {
  it("round-trips and rejects garbage", () => {
    const c = encodeCursor({ finishedAt: "2026-10-07T10:00:00.000Z", id: "w1" });
    expect(decodeCursor(c)).toEqual({ at: new Date("2026-10-07T10:00:00.000Z"), id: "w1" });
    expect(decodeCursor("nope")).toBeNull();
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("boss victory in the feed", () => {
  it("имя босса — только если он повержен этой тренировкой", () => {
    expect(toFeedEntry(row({ meta: { boss: { code: "golem", defeated: true } } }), "viewer").bossDefeated).toBe("Железный Голем");
    expect(toFeedEntry(row({ meta: { boss: { code: "golem", defeated: false } } }), "viewer").bossDefeated).toBeNull();
    expect(toFeedEntry(row({ meta: null }), "viewer").bossDefeated).toBeNull();
  });
});

describe("toFeedEntry: титул", () => {
  it("название по коду; без титула и неизвестный — null", () => {
    expect(toFeedEntry(row({ titleCode: "boss:golem:1" }), "viewer").title).toBe("Гроза Голема");
    expect(toFeedEntry(row({ titleCode: "nope" }), "viewer").title).toBeNull();
    expect(toFeedEntry(row(), "viewer").title).toBeNull();
  });
});

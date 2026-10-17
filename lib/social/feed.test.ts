import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  countsText,
  groupRecords,
  kudosLabel,
  recordExercise,
  respectLabel,
  respectNotice,
  streakMilestone,
  toFeedEntry,
  type FeedRow,
} from "./feed";

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
      { exerciseId: "bench", exerciseName: "Жим лёжа", type: "MAX_WEIGHT", value: 100 },
      { exerciseId: "dips", exerciseName: "Отжимания на брусьях", type: "MAX_REPS", value: 20 },
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
  respects: null,
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
    expect(e.respects[0]).toEqual({
      exerciseId: "bench",
      exerciseName: "Жим лёжа",
      records: [{ type: "MAX_WEIGHT", value: 100 }],
      respect: { count: 0, byMe: false, names: [] },
    });
  });

  it("hideWeights: viewers get no volume, exercise weights or weight PR values; reps PR stays", () => {
    const e = toFeedEntry(row({ hideWeights: true, respects: [{ exerciseId: "bench", count: 1, byMe: true, names: ["Борис"] }] }), "viewer");
    expect(e.volume).toBeNull();
    expect(e.exercises.every((x) => x.top === null)).toBe(true);
    expect(e.respects.map((g) => [g.exerciseId, g.records, g.respect])).toEqual([
      ["bench", [{ type: "MAX_WEIGHT", value: null }], { count: 1, byMe: true, names: ["Борис"] }],
      ["dips", [{ type: "MAX_REPS", value: 20 }], { count: 0, byMe: false, names: [] }],
    ]);
    // Длительность и количество — видны
    expect(e).toMatchObject({ durationSec: 3120, sets: 15, reps: 120 });
    // Свои веса автор видит всегда
    expect(toFeedEntry(row({ hideWeights: true }), "owner")).toMatchObject({ me: true, volume: 6200 });
  });

  it("works for history without a finish summary (seeded / old workouts)", () => {
    const e = toFeedEntry(row({ meta: null, exercises: null, durationSec: null }), "viewer");
    expect(e).toMatchObject({ respects: [], achievements: [], levelUp: null, streakMilestone: null, exercises: [], durationSec: 0 });
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

describe("raidDefeated", () => {
  const raid = { raidId: "r1", code: "golem", defeated: true };
  it("победный удар по рейд-боссу — босс и гильдия", () => {
    expect(toFeedEntry(row({ meta: { raid }, raidGuild: "Молоты" }), "viewer").raidDefeated).toEqual({
      boss: "Древний Железный Голем",
      guild: "Молоты",
    });
  });
  it("не победный удар, удалённая гильдия, без рейда — нет строки", () => {
    expect(toFeedEntry(row({ meta: { raid: { ...raid, defeated: false } }, raidGuild: "Молоты" }), "viewer").raidDefeated).toBeNull();
    expect(toFeedEntry(row({ meta: { raid }, raidGuild: null }), "viewer").raidDefeated).toBeNull();
    expect(toFeedEntry(row(), "viewer").raidDefeated).toBeNull();
  });
});

describe("goals", () => {
  const goals = {
    achieved: [
      { id: "g1", type: "STRENGTH" as const, title: "Жим лёжа — 100 кг", feedTitle: "Жим лёжа" },
      { id: "g2", type: "WORKOUTS" as const, title: "50 тренировок", feedTitle: null },
      { id: "g3", type: "BODY_WEIGHT" as const, title: "Вес тела — 80 кг ↓", feedTitle: null },
    ],
    advanced: [],
  };

  it("выполненные цели в ленте, вес тела — никогда", () => {
    expect(toFeedEntry(row({ meta: { goals } }), "viewer").goals).toEqual(["Жим лёжа — 100 кг", "50 тренировок"]);
  });

  it("скрытые веса — без килограммов", () => {
    expect(toFeedEntry(row({ meta: { goals }, hideWeights: true }), "viewer").goals).toEqual([
      "Жим лёжа",
      "50 тренировок",
    ]);
  });

  it("без целей — пусто", () => {
    expect(toFeedEntry(row(), "viewer").goals).toEqual([]);
  });
});

describe("countsText", () => {
  it("без повторов (кардио и на время) — только подходы", () => {
    expect(countsText({ sets: 15, reps: 120 })).toBe("подходов: 15 · повторов: 120");
    expect(countsText({ sets: 2, reps: 0 })).toBe("подходов: 2");
  });
});

const rec = (exerciseId: string, exerciseName: string, type: "ONE_RM" | "MAX_WEIGHT", value: number) => ({ exerciseId, exerciseName, type, value });

describe("groupRecords", () => {
  it("типы одного упражнения — одна группа, порядок первого появления", () => {
    const groups = groupRecords(
      [rec("bench", "Жим", "ONE_RM", 105), rec("squat", "Присед", "MAX_WEIGHT", 140), rec("bench", "Жим", "MAX_WEIGHT", 100)],
      null,
    );
    expect(groups.map((g) => [g.exerciseId, g.records.map((r) => r.type)])).toEqual([
      ["bench", ["ONE_RM", "MAX_WEIGHT"]],
      ["squat", ["MAX_WEIGHT"]],
    ]);
  });

  it("респект — только своему упражнению", () => {
    const groups = groupRecords(
      [rec("bench", "Жим", "ONE_RM", 105), rec("squat", "Присед", "MAX_WEIGHT", 140)],
      [{ exerciseId: "bench", count: 2, byMe: true, names: ["Маша"] }],
    );
    expect(groups[0].respect).toEqual({ count: 2, byMe: true, names: ["Маша"] });
    expect(groups[1].respect).toEqual({ count: 0, byMe: false, names: [] });
  });
});

describe("respectLabel", () => {
  it("пусто, и «Вы, Маша и ещё 1»", () => {
    expect(respectLabel({ count: 0, byMe: false, names: [] })).toBe("");
    expect(respectLabel({ count: 3, byMe: true, names: ["Маша", "Борис"] })).toBe("Вы, Маша и ещё 1");
  });
});

describe("recordExercise", () => {
  const meta = { records: [{ exerciseId: "bench", exerciseName: "Жим лёжа", type: "MAX_WEIGHT", value: 100 }], weekCount: 1 };
  it("название упражнения, если рекорд в meta есть; иначе null", () => {
    expect(recordExercise(meta, "bench")).toBe("Жим лёжа");
    expect(recordExercise(meta, "forged")).toBeNull();
    expect(recordExercise(null, "bench")).toBeNull();
    expect(recordExercise({ records: "x" }, "bench")).toBeNull();
  });
});

describe("respectNotice", () => {
  it("заголовок и ники: первые два, остальные — «и ещё N»", () => {
    expect(respectNotice("Жим лёжа", ["Маша"])).toEqual({ title: "🏆 Респект за рекорд: Жим лёжа", body: "Маша" });
    expect(respectNotice("Жим лёжа", ["Маша", "Борис", "Глеб"]).body).toBe("Маша, Борис и ещё 1");
    expect(respectNotice("Жим лёжа", ["Маша", "Борис"]).body).toBe("Маша, Борис");
  });
});

import { describe, expect, it } from "vitest";
import { GOBLIN_REWARD_XP, GOBLIN_WINDOW_MS, goblinProgress, rollsFor, shouldSpawn } from "./rules";

const now = new Date("2026-10-15T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const base = { now, lastSpawnedAt: null, hasEncounter: false, rolls: 1, random: 0 };

describe("shouldSpawn", () => {
  it("one per workout, from the second working set, every 14 days, 1% chance", () => {
    expect(shouldSpawn(base)).toBe(true);
    expect(shouldSpawn({ ...base, hasEncounter: true })).toBe(false);
    expect(shouldSpawn({ ...base, rolls: 0 })).toBe(false);
    expect(shouldSpawn({ ...base, lastSpawnedAt: daysAgo(13) })).toBe(false);
    expect(shouldSpawn({ ...base, lastSpawnedAt: daysAgo(14) })).toBe(true);
    expect(shouldSpawn({ ...base, random: 0.009 })).toBe(true);
    expect(shouldSpawn({ ...base, random: 0.01 })).toBe(false);
    expect(GOBLIN_REWARD_XP).toBe(150);
  });

  it("several new sets in one save — one chance per set", () => {
    // 1 − 0.99² ≈ 0.0199
    expect(shouldSpawn({ ...base, rolls: 2, random: 0.0195 })).toBe(true);
    expect(shouldSpawn({ ...base, rolls: 2, random: 0.0201 })).toBe(false);
  });
});

describe("rollsFor", () => {
  it("only sets beyond the ones already rolled, never for the first set", () => {
    expect(rollsFor({ rolledSets: 0, completed: 1 })).toBe(0);
    expect(rollsFor({ rolledSets: 1, completed: 2 })).toBe(1);
    expect(rollsFor({ rolledSets: 0, completed: 3 })).toBe(2);
    // Сняли отметку и поставили снова — бросок уже был
    expect(rollsFor({ rolledSets: 3, completed: 3 })).toBe(0);
    expect(rollsFor({ rolledSets: 3, completed: 2 })).toBe(0);
  });
});

describe("goblinProgress", () => {
  const spawned = new Date("2026-10-15T12:00:00Z");
  const at = (min: number, sec = 0) => new Date(spawned.getTime() + min * 60_000 + sec * 1000).toISOString();
  const work = (t: string | null) => ({ completedAt: t, isWarmup: false, reps: 10 });

  it("three working sets inside 10 minutes catch it", () => {
    const p = goblinProgress(spawned, [work(at(1)), work(at(4)), work(at(9, 59))], at(10));
    expect(p).toMatchObject({ done: 3, caught: true, escaped: false });
  });

  it("sets before the spawn, after the window and warm-ups do not count", () => {
    const sets = [work(new Date(spawned.getTime() - 1000).toISOString()), work(at(2)), { completedAt: at(3), isWarmup: true, reps: 10 }, { completedAt: at(3), isWarmup: false, reps: "0" }, { completedAt: at(3), isWarmup: false, reps: "" }, work(at(10, 1)), work(null)];
    const p = goblinProgress(spawned, sets, at(11));
    expect(p).toMatchObject({ done: 1, caught: false, escaped: true, leftMs: 0 });
  });

  it("time left while active", () => {
    expect(goblinProgress(spawned, [], at(4)).leftMs).toBe(GOBLIN_WINDOW_MS - 4 * 60_000);
    expect(goblinProgress(spawned, [], at(4)).escaped).toBe(false);
  });
});

describe("goblinProgress — timed and cardio sets", () => {
  it("a set with time but no reps counts", () => {
    const at = new Date(now.getTime() + 60_000).toISOString();
    const set = { completedAt: at, isWarmup: false, reps: 0, durationSec: 60 };
    expect(goblinProgress(now, [set, set, set], new Date(now.getTime() + 120_000)).caught).toBe(true);
    expect(goblinProgress(now, [{ ...set, durationSec: 0 }], new Date(now.getTime() + 120_000)).done).toBe(0);
  });
});

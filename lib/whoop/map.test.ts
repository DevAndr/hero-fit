import { describe, expect, it } from "vitest";
import { toWhoopWorkout } from "./map";
import type { WhoopApiWorkout } from "./types";

const full: WhoopApiWorkout = {
  id: "w1",
  start: "2026-10-17T10:00:00.000Z",
  end: "2026-10-17T11:00:00.000Z",
  sport_name: "weightlifting",
  score_state: "SCORED",
  score: {
    strain: 12.3,
    average_heart_rate: 140,
    max_heart_rate: 172,
    kilojoule: 1500,
    zone_durations: {
      zone_zero_milli: 1,
      zone_one_milli: 2,
      zone_two_milli: 3,
      zone_three_milli: 4,
      zone_four_milli: 5,
      zone_five_milli: 6,
    },
  },
};

describe("toWhoopWorkout", () => {
  it("полный ответ", () => {
    const r = toWhoopWorkout(full);
    expect(r.avgHr).toBe(140);
    expect(r.maxHr).toBe(172);
    expect(r.strain).toBe(12.3);
    expect(r.kilojoule).toBe(1500);
    expect(r.zonesMs).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.start).toBeInstanceOf(Date);
    expect(r.start.toISOString()).toBe(full.start);
  });

  it("отсутствующая зона — 0", () => {
    const r = toWhoopWorkout({ ...full, score: { ...full.score!, zone_durations: { zone_two_milli: 9 } } });
    expect(r.zonesMs).toEqual([0, 0, 9, 0, 0, 0]);
  });

  it("без score — null и пустые зоны", () => {
    const r = toWhoopWorkout({ ...full, score: undefined, score_state: "PENDING_SCORE" });
    expect(r.scoreState).toBe("PENDING_SCORE");
    expect(r.strain).toBeNull();
    expect(r.avgHr).toBeNull();
    expect(r.zonesMs).toEqual([]);
  });

  it("неизвестный score_state — UNSCORABLE", () => {
    expect(toWhoopWorkout({ ...full, score_state: "WEIRD" }).scoreState).toBe("UNSCORABLE");
  });
});

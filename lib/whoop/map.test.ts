import { describe, expect, it } from "vitest";
import { toWhoopRecovery, toWhoopSleep, toWhoopWorkout } from "./map";
import type { WhoopApiRecovery, WhoopApiSleep, WhoopApiWorkout } from "./types";

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
    const r = toWhoopWorkout(full)!;
    expect(r.avgHr).toBe(140);
    expect(r.maxHr).toBe(172);
    expect(r.strain).toBe(12.3);
    expect(r.kilojoule).toBe(1500);
    expect(r.zonesMs).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.start).toBeInstanceOf(Date);
    expect(r.start.toISOString()).toBe(full.start);
  });

  it("отсутствующая зона — 0", () => {
    const r = toWhoopWorkout({ ...full, score: { ...full.score!, zone_durations: { zone_two_milli: 9 } } })!;
    expect(r.zonesMs).toEqual([0, 0, 9, 0, 0, 0]);
  });

  it("без score — null и пустые зоны", () => {
    const r = toWhoopWorkout({ ...full, score: undefined, score_state: "PENDING_SCORE" })!;
    expect(r.scoreState).toBe("PENDING_SCORE");
    expect(r.strain).toBeNull();
    expect(r.avgHr).toBeNull();
    expect(r.zonesMs).toEqual([]);
  });

  it("неизвестный score_state — UNSCORABLE", () => {
    expect(toWhoopWorkout({ ...full, score_state: "WEIRD" })!.scoreState).toBe("UNSCORABLE");
  });

  it("дробный пульс и зоны — округлены", () => {
    const r = toWhoopWorkout({
      ...full,
      score: { ...full.score!, average_heart_rate: 140.6, max_heart_rate: 171.4, zone_durations: { zone_one_milli: 1.7 } },
    })!;
    expect(r.avgHr).toBe(141);
    expect(r.maxHr).toBe(171);
    expect(r.zonesMs).toEqual([0, 2, 0, 0, 0, 0]);
  });

  it("строка или NaN вместо числа — null", () => {
    const bad = { ...full.score!, average_heart_rate: "140", strain: Number.NaN, kilojoule: Infinity } as unknown as WhoopApiWorkout["score"];
    const r = toWhoopWorkout({ ...full, score: bad })!;
    expect(r.avgHr).toBeNull();
    expect(r.strain).toBeNull();
    expect(r.kilojoule).toBeNull();
    expect(r.maxHr).toBe(172);
  });

  it("битая запись — null", () => {
    expect(toWhoopWorkout({ ...full, end: "not a date" })).toBeNull();
    expect(toWhoopWorkout({ ...full, start: undefined } as unknown as WhoopApiWorkout)).toBeNull();
    expect(toWhoopWorkout({ ...full, id: "" })).toBeNull();
    expect(toWhoopWorkout({ ...full, id: 5 } as unknown as WhoopApiWorkout)).toBeNull();
    expect(toWhoopWorkout(null as unknown as WhoopApiWorkout)).toBeNull();
  });
});

const sleep: WhoopApiSleep = {
  id: "sl-1",
  cycle_id: 93845,
  start: "2026-10-18T22:00:00.000Z",
  end: "2026-10-19T06:00:00.000Z",
  nap: false,
  score_state: "SCORED",
  score: {
    stage_summary: {
      total_light_sleep_time_milli: 10_000_000,
      total_slow_wave_sleep_time_milli: 5_000_000,
      total_rem_sleep_time_milli: 6_000_000,
    },
    sleep_needed: {
      baseline_milli: 27_000_000,
      need_from_sleep_debt_milli: 1_000_000,
      need_from_recent_strain_milli: 2_000_000,
      need_from_recent_nap_milli: 3_000_000,
    },
    sleep_performance_percentage: 87.6,
  },
};

describe("toWhoopSleep", () => {
  it("полный сон", () => {
    const r = toWhoopSleep(sleep)!;
    expect(r.id).toBe("sl-1");
    expect(r.cycleId).toBe("93845");
    expect(r.sleepMs).toBe(21_000_000);
    expect(r.needMs).toBe(33_000_000);
    expect(r.performancePct).toBe(88);
    expect(r.sleepScoreState).toBe("SCORED");
    expect(r.end.toISOString()).toBe("2026-10-19T06:00:00.000Z");
  });

  it("дневной сон, нет id, битый end, нет cycle_id — null", () => {
    expect(toWhoopSleep({ ...sleep, nap: true })).toBeNull();
    expect(toWhoopSleep({ ...sleep, id: "" })).toBeNull();
    expect(toWhoopSleep({ ...sleep, end: "bad" })).toBeNull();
    expect(toWhoopSleep({ ...sleep, cycle_id: undefined } as unknown as WhoopApiSleep)).toBeNull();
    expect(toWhoopSleep({ ...sleep, cycle_id: "x" } as unknown as WhoopApiSleep)).toBeNull();
  });

  it("PENDING_SCORE без score — поля null", () => {
    const r = toWhoopSleep({ ...sleep, score_state: "PENDING_SCORE", score: undefined })!;
    expect(r.sleepScoreState).toBe("PENDING_SCORE");
    expect(r.sleepMs).toBeNull();
    expect(r.needMs).toBeNull();
    expect(r.performancePct).toBeNull();
  });

  it("неизвестный score_state — UNSCORABLE", () => {
    expect(toWhoopSleep({ ...sleep, score_state: "WAT" })!.sleepScoreState).toBe("UNSCORABLE");
  });

  it("строка вместо числа в стадии — sleepMs null", () => {
    const bad = {
      ...sleep,
      score: { ...sleep.score!, stage_summary: { ...sleep.score!.stage_summary, total_rem_sleep_time_milli: "6" } },
    } as unknown as WhoopApiSleep;
    const r = toWhoopSleep(bad)!;
    expect(r.sleepMs).toBeNull();
    expect(r.needMs).toBe(33_000_000);
  });
});

const recovery: WhoopApiRecovery = {
  cycle_id: 93845,
  sleep_id: "sl-1",
  score_state: "SCORED",
  score: { user_calibrating: false, recovery_score: 67.4, resting_heart_rate: 51.6, hrv_rmssd_milli: 38.27 },
};

describe("toWhoopRecovery", () => {
  it("полное восстановление", () => {
    const r = toWhoopRecovery(recovery)!;
    expect(r.sleepId).toBe("sl-1");
    expect(r.recoveryPct).toBe(67);
    expect(r.restingHr).toBe(52);
    expect(r.hrvMs).toBe(38.27);
    expect(r.calibrating).toBe(false);
    expect(r.recoveryScoreState).toBe("SCORED");
  });

  it("калибровка", () => {
    expect(toWhoopRecovery({ ...recovery, score: { ...recovery.score!, user_calibrating: true } })!.calibrating).toBe(true);
  });

  it("нет sleep_id — null; PENDING_SCORE без score — null-поля", () => {
    expect(toWhoopRecovery({ ...recovery, sleep_id: "" })).toBeNull();
    const r = toWhoopRecovery({ ...recovery, score_state: "PENDING_SCORE", score: undefined })!;
    expect(r.recoveryPct).toBeNull();
    expect(r.restingHr).toBeNull();
    expect(r.hrvMs).toBeNull();
    expect(r.calibrating).toBe(false);
  });
});

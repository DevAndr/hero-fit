import { describe, expect, it } from "vitest";
import { matchWhoop } from "./match";
import type { WhoopWorkoutRow } from "./types";

const at = (hm: string) => new Date(`2026-10-17T${hm}:00.000Z`);
const workout = { startedAt: at("10:00"), finishedAt: at("11:00") };

function row(start: string, end: string, o: Partial<WhoopWorkoutRow> = {}): WhoopWorkoutRow {
  return {
    id: `${start}-${end}`,
    start: at(start),
    end: at(end),
    sportName: "weightlifting",
    scoreState: "SCORED",
    strain: 10,
    avgHr: 130,
    maxHr: 160,
    kilojoule: 1000,
    zonesMs: [0, 0, 0, 0, 0, 0],
    ...o,
  };
}

describe("matchWhoop", () => {
  it("одна активность внутри тренировки", () => {
    const m = matchWhoop(workout, [row("10:05", "10:55", { kilojoule: 1500 })]);
    expect(m?.kind).toBe("data");
    if (m?.kind === "data") {
      expect(m.summary.fragments).toBe(1);
      expect(m.summary.kcal).toBe(Math.round(1500 / 4.184));
    }
  });

  it("касание границы — нет совпадения", () => {
    expect(matchWhoop(workout, [row("11:00", "11:30")])).toBeNull();
  });

  it("пересечение 4 мин при длине 60 мин — нет", () => {
    expect(matchWhoop(workout, [row("10:56", "11:56")])).toBeNull();
  });

  it("короткая активность с долей >= 30% подходит", () => {
    expect(matchWhoop(workout, [row("10:58", "11:03")])?.kind).toBe("data");
  });

  it("два фрагмента объединяются", () => {
    const m = matchWhoop(workout, [
      row("10:00", "10:20", { avgHr: 120, maxHr: 150, strain: 8, zonesMs: [1, 1, 1, 1, 1, 1] }),
      row("10:25", "11:05", { avgHr: 150, maxHr: 175, strain: 11, zonesMs: [2, 2, 2, 2, 2, 2] }),
    ]);
    expect(m?.kind).toBe("data");
    if (m?.kind === "data") {
      expect(m.summary.avgHr).toBe(140);
      expect(m.summary.maxHr).toBe(175);
      expect(m.summary.strain).toBe(11);
      expect(m.summary.zonesMs).toEqual([3, 3, 3, 3, 3, 3]);
      expect(m.summary.fragments).toBe(2);
    }
  });

  it("только PENDING_SCORE — pending", () => {
    expect(matchWhoop(workout, [row("10:05", "10:55", { scoreState: "PENDING_SCORE" })])).toEqual({
      kind: "pending",
    });
  });

  it("SCORED + PENDING — data по SCORED", () => {
    const m = matchWhoop(workout, [
      row("10:00", "10:30", { scoreState: "PENDING_SCORE" }),
      row("10:30", "11:00"),
    ]);
    expect(m?.kind).toBe("data");
    if (m?.kind === "data") expect(m.summary.fragments).toBe(1);
  });

  it("только UNSCORABLE — null", () => {
    expect(matchWhoop(workout, [row("10:05", "10:55", { scoreState: "UNSCORABLE" })])).toBeNull();
  });

  it("avgHr null у одной активности не искажает среднее", () => {
    const m = matchWhoop(workout, [row("10:00", "10:30", { avgHr: null }), row("10:30", "11:00", { avgHr: 150 })]);
    expect(m?.kind === "data" && m.summary.avgHr).toBe(150);
  });

  it("finishedAt <= startedAt — null", () => {
    expect(matchWhoop({ startedAt: at("11:00"), finishedAt: at("10:00") }, [row("10:00", "11:00")])).toBeNull();
    expect(matchWhoop({ startedAt: at("10:00"), finishedAt: at("10:00") }, [row("10:00", "11:00")])).toBeNull();
  });
});

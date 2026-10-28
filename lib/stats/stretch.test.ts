import { describe, expect, it } from "vitest";
import { stretchMinutes, topZones } from "@/lib/stats/stretch";

describe("topZones", () => {
  it("считает минуты по основной (первой) зоне, по убыванию", () => {
    const rows = [
      { zones: ["HIPS", "QUADS"] as const, sec: 120 },
      { zones: ["CHEST"] as const, sec: 300 },
      { zones: ["HIPS"] as const, sec: 60 },
    ].map((r) => ({ zones: [...r.zones], sec: r.sec }));
    expect(topZones(rows)).toEqual([
      { zone: "CHEST", minutes: 5 },
      { zone: "HIPS", minutes: 3 },
    ]);
  });

  it("при равенстве — порядок STRETCH_ZONES, берёт первые n", () => {
    const rows = (["CALVES", "NECK", "BACK", "CHEST"] as const).map((z) => ({ zones: [z], sec: 60 }));
    expect(topZones([...rows]).map((r) => r.zone)).toEqual(["NECK", "CHEST", "BACK"]);
    expect(topZones([...rows], 1)).toHaveLength(1);
  });

  it("игнорирует строки без зон и без времени", () => {
    expect(topZones([{ zones: [], sec: 90 }, { zones: ["NECK"], sec: 0 }])).toEqual([]);
  });
});

describe("stretchMinutes — минуты удержания вниз, как XP", () => {
  it("округляет вниз", () => {
    expect(stretchMinutes(89)).toBe(1);
    expect(stretchMinutes(119)).toBe(1);
    expect(stretchMinutes(120)).toBe(2);
  });
  it("меньше минуты — 0 (минимум не навязывается)", () => {
    expect(stretchMinutes(59)).toBe(0);
    expect(stretchMinutes(0)).toBe(0);
  });
});

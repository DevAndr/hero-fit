import { describe, expect, it } from "vitest";
import { MUSCLE_GROUPS } from "@/lib/muscle-groups";
import { BODY_BACK, BODY_FRONT } from "./body-map-data";

const groups = (parts: typeof BODY_FRONT) => new Set(parts.map((p) => p.group).filter(Boolean));

describe("body map data", () => {
  it("вид спереди — без мышц спины, вид сзади — без груди и пресса", () => {
    expect([...groups(BODY_FRONT)].sort()).toEqual(["ABS", "BICEPS", "CALVES", "CHEST", "FOREARMS", "LEGS", "SHOULDERS", "TRICEPS"]);
    expect([...groups(BODY_BACK)].sort()).toEqual(["BACK", "CALVES", "FOREARMS", "LEGS", "SHOULDERS", "TRAPS", "TRICEPS"]);
  });

  it("каждая группа видна хотя бы на одном виде", () => {
    const all = new Set([...groups(BODY_FRONT), ...groups(BODY_BACK)]);
    expect(MUSCLE_GROUPS.filter((g) => !all.has(g))).toEqual([]);
  });

  it("число частей — как в исходнике (13 спереди, 14 сзади)", () => {
    expect(BODY_FRONT.length).toBe(13);
    expect(BODY_BACK.length).toBe(14);
  });
});

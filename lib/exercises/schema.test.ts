import { describe, expect, it } from "vitest";
import { parseExerciseForm } from "./schema";

function form(entries: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}

const valid: [string, string][] = [
  ["name", "  Жим гантелей  "],
  ["description", ""],
  ["muscleGroups", "CHEST"],
  ["muscleGroups", "TRICEPS"],
  ["defaultRestSec", "90"],
];

describe("parseExerciseForm", () => {
  it("parses a valid form, trims name, keeps muscle group order (first = primary)", () => {
    const r = parseExerciseForm(form(valid));
    expect(r.success).toBe(true);
    expect(r.data).toEqual({
      id: undefined,
      name: "Жим гантелей",
      description: null,
      muscleGroups: ["CHEST", "TRICEPS"],
      isBodyweight: false,
      kind: "REPS",
      defaultRestSec: 90,
    });
  });

  it("reads checkbox 'on' as bodyweight and keeps id for edit", () => {
    const r = parseExerciseForm(form([...valid, ["isBodyweight", "on"], ["id", "abc"]]));
    expect(r.data).toMatchObject({ isBodyweight: true, id: "abc" });
  });

  it("drops duplicate muscle groups", () => {
    const r = parseExerciseForm(form([...valid, ["muscleGroups", "CHEST"]]));
    expect(r.data?.muscleGroups).toEqual(["CHEST", "TRICEPS"]);
  });

  it("requires a name and at least one muscle group", () => {
    const r = parseExerciseForm(form([["name", " "], ["defaultRestSec", "60"]]));
    expect(r.success).toBe(false);
    expect(r.errors?.name).toBeDefined();
    expect(r.errors?.muscleGroups).toBeDefined();
  });

  it("rejects unknown muscle group and out-of-range rest", () => {
    const r = parseExerciseForm(
      form([["name", "Тест"], ["muscleGroups", "NECK"], ["defaultRestSec", "9999"]]),
    );
    expect(r.errors?.muscleGroups).toBeDefined();
    expect(r.errors?.defaultRestSec).toBeDefined();
  });
});

describe("exercise kind", () => {
  it("defaults to REPS, accepts TIME and CARDIO, rejects garbage", () => {
    expect(parseExerciseForm(form(valid)).data?.kind).toBe("REPS");
    expect(parseExerciseForm(form([...valid, ["kind", "CARDIO"]])).data?.kind).toBe("CARDIO");
    expect(parseExerciseForm(form([...valid, ["kind", "TIME"]])).data?.kind).toBe("TIME");
    expect(parseExerciseForm(form([...valid, ["kind", "SWIM"]])).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { templateSchema } from "./schema";

const item = { exerciseId: "e1", targetSets: 3, targetReps: 8, targetWeight: 60, restSec: 90 };

describe("templateSchema", () => {
  it("accepts a valid template, trims name, empty description → null", () => {
    const r = templateSchema.parse({ name: "  Грудь  ", description: "", exercises: [item] });
    expect(r).toEqual({ name: "Грудь", description: null, exercises: [{ ...item, step: null, group: null }] });
  });

  it("allows empty reps/weight targets", () => {
    const r = templateSchema.parse({
      name: "X",
      description: "",
      exercises: [{ ...item, targetReps: null, targetWeight: null }],
    });
    expect(r.exercises[0]).toMatchObject({ targetReps: null, targetWeight: null });
  });

  it("requires a name and at least one exercise", () => {
    const r = templateSchema.safeParse({ name: " ", description: "", exercises: [] });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toContain("name");
    expect(paths).toContain("exercises");
  });

  it("validates target ranges", () => {
    for (const bad of [{ targetSets: 0 }, { targetSets: 21 }, { targetReps: -1 }, { targetWeight: 2000 }, { restSec: 601 }]) {
      expect(templateSchema.safeParse({ name: "X", description: "", exercises: [{ ...item, ...bad }] }).success).toBe(false);
    }
  });
});

describe("templateSchema — superset group", () => {
  it("group is optional and garbage-tolerant", () => {
    const base = { exerciseId: "e", targetSets: 3, targetReps: null, targetWeight: null, restSec: 60 };
    const r = templateSchema.parse({ name: "T", description: "", exercises: [base, { ...base, group: 2 }, { ...base, group: "x" }] });
    expect(r.exercises.map((e) => e.group)).toEqual([null, 2, null]);
  });
});

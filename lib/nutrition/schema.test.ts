import { describe, expect, it } from "vitest";
import { nutritionProfileSchema } from "./schema";

const year = new Date().getFullYear();
const form = { gender: "MALE", birthYear: "1996", heightCm: "180", weight: "80,5", activity: "MODERATE", goal: "MAINTAIN" };
const errors = (o: object) => {
  const r = nutritionProfileSchema.safeParse({ ...form, ...o });
  return r.success ? null : Object.keys(r.error.flatten().fieldErrors);
};

describe("nutritionProfileSchema", () => {
  it("parses form strings into numbers (comma as decimal separator)", () => {
    expect(nutritionProfileSchema.parse(form)).toEqual({ gender: "MALE", birthYear: 1996, heightCm: 180, weight: 80.5, activity: "MODERATE", goal: "MAINTAIN" });
  });

  it("at least 14 years old", () => {
    expect(errors({ birthYear: String(year - 14) })).toBeNull();
    expect(errors({ birthYear: String(year - 13) })).toEqual(["birthYear"]);
    expect(errors({ birthYear: "1925" })).toEqual(["birthYear"]);
  });

  it("height 120…230, weight 30…300", () => {
    expect(errors({ heightCm: "119" })).toEqual(["heightCm"]);
    expect(errors({ heightCm: "231" })).toEqual(["heightCm"]);
    expect(errors({ weight: "29" })).toEqual(["weight"]);
    expect(errors({ weight: "301" })).toEqual(["weight"]);
  });

  it("gender, activity and goal are required", () => {
    expect(errors({ gender: undefined })).toEqual(["gender"]);
    expect(errors({ activity: "" })).toEqual(["activity"]);
    expect(errors({ goal: "X" })).toEqual(["goal"]);
  });
});

import { describe, expect, it } from "vitest";
import { foodEntrySchema } from "./food-schema";

const form = { meal: "LUNCH", name: "  Гречка  ", kcal: "350", protein: "12,5", fat: "", carbs: "60" };
const errors = (o: object) => {
  const r = foodEntrySchema.safeParse({ ...form, ...o });
  return r.success ? null : Object.keys(r.error.flatten().fieldErrors);
};

describe("foodEntrySchema", () => {
  it("trims the name, comma decimals, empty macros → null", () => {
    expect(foodEntrySchema.parse(form)).toEqual({ meal: "LUNCH", name: "Гречка", kcal: 350, protein: 12.5, fat: null, carbs: 60 });
  });

  it("a thousands space is fine: «1 500»", () => {
    expect(foodEntrySchema.parse({ ...form, kcal: "1 500" }).kcal).toBe(1500);
  });

  it("name 1…80", () => {
    expect(errors({ name: "   " })).toEqual(["name"]);
    expect(errors({ name: "x".repeat(81) })).toEqual(["name"]);
  });

  it("kcal — whole 0…5000, macros 0…500", () => {
    expect(errors({ kcal: "-1" })).toEqual(["kcal"]);
    expect(errors({ kcal: "5001" })).toEqual(["kcal"]);
    expect(errors({ kcal: "12.5" })).toEqual(["kcal"]);
    expect(errors({ kcal: "" })).toEqual(["kcal"]);
    expect(errors({ protein: "501" })).toEqual(["protein"]);
    expect(errors({ meal: "X" })).toEqual(["meal"]);
  });
});

import { describe, expect, it } from "vitest";
import { planInputSchema, planPatchSchema } from "./schema";

const valid = { templateId: null, title: "Ноги", date: "2026-10-08", time: "18:00", durationMin: 60, repeatWeekdays: [0, 3] };

describe("plan schemas", () => {
  it("accepts a valid plan", () => {
    expect(planInputSchema.parse(valid)).toEqual(valid);
    expect(planInputSchema.parse({ ...valid, title: "  Ноги  " }).title).toBe("Ноги");
  });

  it("time HH:MM within a day", () => {
    for (const time of ["25:00", "18:7", "18:60", "1800"]) expect(planInputSchema.safeParse({ ...valid, time }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...valid, time: "00:00" }).success).toBe(true);
    expect(planInputSchema.safeParse({ ...valid, time: "23:30" }).success).toBe(true);
  });

  it("duration 15…240 in steps of 15", () => {
    for (const durationMin of [0, 10, 250, 50]) expect(planInputSchema.safeParse({ ...valid, durationMin }).success).toBe(false);
    for (const durationMin of [15, 90, 240]) expect(planInputSchema.safeParse({ ...valid, durationMin }).success).toBe(true);
  });

  it("weekdays 0…6 without duplicates; real dates only", () => {
    expect(planInputSchema.safeParse({ ...valid, repeatWeekdays: [7] }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...valid, repeatWeekdays: [1, 1] }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
    expect(planInputSchema.safeParse({ ...valid, title: "" }).success).toBe(false);
  });

  it("patch: every field optional, same rules", () => {
    expect(planPatchSchema.parse({ time: "07:30" })).toEqual({ time: "07:30" });
    expect(planPatchSchema.safeParse({ durationMin: 50 }).success).toBe(false);
  });
});

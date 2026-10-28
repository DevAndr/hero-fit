import { describe, expect, it } from "vitest";
import { genderSchema } from "./gender";

describe("genderSchema", () => {
  it("MALE и FEMALE — как есть, NONE — null", () => {
    expect(genderSchema.parse("MALE")).toBe("MALE");
    expect(genderSchema.parse("FEMALE")).toBe("FEMALE");
    expect(genderSchema.parse("NONE")).toBeNull();
  });

  it("другое значение отклоняется", () => {
    expect(genderSchema.safeParse("OTHER").success).toBe(false);
    expect(genderSchema.safeParse("").success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { assistantAvailable } from "./access";

describe("assistantAvailable", () => {
  it("нужны и флаг, и включённый помощник", () => {
    expect(assistantAvailable(true, true)).toBe(true);
    expect(assistantAvailable(true, false)).toBe(false);
    expect(assistantAvailable(false, true)).toBe(false);
    expect(assistantAvailable(false, false)).toBe(false);
  });
});

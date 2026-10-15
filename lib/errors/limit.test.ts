import { describe, expect, it } from "vitest";
import { createLimiter } from "./limit";

describe("createLimiter", () => {
  it("max hits per key in the window, then resets", () => {
    const limiter = createLimiter({ max: 30, windowMs: 60_000 });
    const t = 1_000_000;
    for (let i = 0; i < 30; i++) expect(limiter.hit("a", t)).toBe(true);
    expect(limiter.hit("a", t)).toBe(false);
    expect(limiter.hit("b", t)).toBe(true);
    expect(limiter.hit("a", t + 60_001)).toBe(true);
  });
});

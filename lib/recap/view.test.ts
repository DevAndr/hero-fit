import { describe, expect, it } from "vitest";
import { delta, deltaLabel, weekRangeLabel } from "./view";

describe("weekRangeLabel", () => {
  it("same month", () => {
    expect(weekRangeLabel("2026-10-05")).toBe("5–11 октября");
  });
  it("across months", () => {
    expect(weekRangeLabel("2026-09-28")).toBe("28 сентября – 4 октября");
  });
});

describe("delta", () => {
  it("up, down, same", () => {
    expect(delta(12, 10)).toEqual({ pct: 20, sign: "up" });
    expect(delta(5, 10)).toEqual({ pct: 50, sign: "down" });
    expect(delta(3, 3)).toEqual({ pct: 0, sign: "same" });
  });
  it("from zero", () => {
    expect(delta(5, 0)).toEqual({ pct: null, sign: "up" });
  });
});

describe("deltaLabel", () => {
  it("percent, from zero and unchanged", () => {
    expect(deltaLabel(12, 10)).toBe("+20%");
    expect(deltaLabel(5, 10)).toBe("−50%");
    expect(deltaLabel(5, 0)).toBe("впервые");
    expect(deltaLabel(3, 3)).toBe("как неделей ранее");
  });
});

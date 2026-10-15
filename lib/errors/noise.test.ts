import { describe, expect, it } from "vitest";
import { isNoise } from "./noise";

const own = "TypeError\n    at f (/_next/static/chunks/app.js:1:1)";

describe("isNoise", () => {
  it.each([
    "Failed to fetch",
    "TypeError: Failed to fetch",
    "NetworkError when attempting to fetch resource.",
    "Load failed",
    "The network connection was lost.",
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications.",
    "AbortError: The operation was aborted.",
  ])("drops %s", (message) => {
    expect(isNoise({ message, stack: own })).toBe(true);
  });

  it("drops a cross-origin «Script error.» without stack and extension-only stacks", () => {
    expect(isNoise({ message: "Script error.", stack: null })).toBe(true);
    expect(isNoise({ message: "x", stack: "Error\n    at a (chrome-extension://abc/x.js:1:1)\n    at b (moz-extension://d/y.js:2:2)" })).toBe(true);
  });

  it("keeps real errors", () => {
    expect(isNoise({ message: "TypeError: x is undefined", stack: own })).toBe(false);
    expect(isNoise({ message: "Script error.", stack: own })).toBe(false);
  });
});

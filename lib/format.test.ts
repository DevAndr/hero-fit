import { describe, expect, it } from "vitest";
import { formatDuration, plural } from "./format";

describe("plural", () => {
  it("Russian forms", () => {
    const w = (n: number) => plural(n, "неделя", "недели", "недель");
    expect([1, 2, 5, 11, 12, 21, 22, 25, 104].map(w)).toEqual([
      "неделя", "недели", "недель", "недель", "недель", "неделя", "недели", "недель", "недели",
    ]);
  });
});

describe("formatDuration", () => {
  it("minutes and hours in words, no seconds", () => {
    expect([0, 8, 59, 60, 479, 3599, 3600, 3900, 7200, 7259].map(formatDuration)).toEqual([
      "< 1 мин", "< 1 мин", "< 1 мин", "1 мин", "7 мин", "59 мин", "1 ч", "1 ч 5 мин", "2 ч", "2 ч",
    ]);
  });
});

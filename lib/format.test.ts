import { describe, expect, it } from "vitest";
import { plural } from "./format";

describe("plural", () => {
  it("Russian forms", () => {
    const w = (n: number) => plural(n, "неделя", "недели", "недель");
    expect([1, 2, 5, 11, 12, 21, 22, 25, 104].map(w)).toEqual([
      "неделя", "недели", "недель", "недель", "недель", "неделя", "недели", "недель", "недели",
    ]);
  });
});

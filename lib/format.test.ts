import { describe, expect, it } from "vitest";
import { formatDuration, formatTonnage, formatTonnageAxis, plural } from "./format";

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

describe("formatTonnage", () => {
  it("kilograms below a tonne, tonnes with one decimal above", () => {
    expect([0, 850, 999.4, 1000, 15900, 15000, 15949, 123456].map(formatTonnage)).toEqual([
      "0 кг", "850 кг", "999 кг", "1 т", "15,9 т", "15 т", "15,9 т", "123,5 т",
    ]);
  });

  it("rounds to a tonne instead of «1000 кг»", () => {
    expect(formatTonnage(999.6)).toBe("1 т");
  });
});

describe("formatTonnageAxis", () => {
  it("bare numbers below a tonne, tonnes above, never «тыс.»", () => {
    const labels = [0, 500, 1000, 1500, 15900, 2500.4].map(formatTonnageAxis);
    expect(labels).toEqual(["0", "500", "1 т", "1,5 т", "15,9 т", "2,5 т"]);
    expect(labels.join(" ")).not.toMatch(/тыс|кг/);
  });
});

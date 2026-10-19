import { describe, expect, it } from "vitest";
import { dots, dotsLevel, wilks } from "./strength-score";

describe("strength-score", () => {
  it.each([
    ["male", 600, 100, 369.31, 365.15],
    ["male", 500, 80, 344.77, 341.35],
    ["female", 300, 60, 332.56, 334.47],
    ["female", 400, 70, 404.5, 397.94],
  ] as const)("%s %i/%i → DOTS %f, Wilks %f", (sex, total, bw, d, w) => {
    expect(dots(total, bw, sex)).toBeCloseTo(d, 2);
    expect(wilks(total, bw, sex)).toBeCloseTo(w, 2);
  });

  it("ограничивает вес тела", () => {
    expect(dots(500, 250, "male")).toBe(dots(500, 210, "male"));
    expect(dots(500, 20, "male")).toBe(dots(500, 40, "male"));
    expect(dots(500, 200, "female")).toBe(dots(500, 150, "female"));
    expect(wilks(300, 20, "female")).toBe(wilks(300, 26.51, "female"));
    expect(wilks(300, 300, "male")).toBe(wilks(300, 201.9, "male"));
  });

  it("нулевые и некорректные входные данные дают 0", () => {
    expect(dots(0, 80, "male")).toBe(0);
    expect(dots(500, 0, "male")).toBe(0);
    expect(dots(NaN, 80, "male")).toBe(0);
    expect(wilks(-5, 80, "female")).toBe(0);
    expect(wilks(500, Infinity, "male")).toBe(0);
  });

  it("уровни по DOTS", () => {
    expect(dotsLevel(199.99)).toBe("Начинающий");
    expect(dotsLevel(200)).toBe("Любитель");
    expect(dotsLevel(300)).toBe("Продвинутый");
    expect(dotsLevel(499.99)).toBe("Мастер");
    expect(dotsLevel(500)).toBe("Элита");
  });
});

import { describe, expect, it } from "vitest";
import { createClickThrottle } from "./click-throttle";

describe("createClickThrottle", () => {
  it("одно открытие на пару смотрящий–тренер за окно", () => {
    const t = createClickThrottle(10 * 60_000);
    const now = 1_000_000;
    expect(t.take("v1", "c1", now)).toBe(true);
    expect(t.take("v1", "c1", now + 60_000)).toBe(false);
    expect(t.take("v2", "c1", now + 60_000)).toBe(true);
    expect(t.take("v1", "c2", now + 60_000)).toBe(true);
    expect(t.take("v1", "c1", now + 10 * 60_000)).toBe(true);
  });

  it("старые записи вычищаются — память не растёт", () => {
    const t = createClickThrottle(1000, 100);
    for (let i = 0; i < 100; i++) t.take(`v${i}`, "c", 0);
    t.take("late", "c", 5000);
    expect(t.size()).toBe(1);
  });
});

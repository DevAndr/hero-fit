import { describe, expect, it } from "vitest";
import { isFinishMeta } from "./meta";

describe("isFinishMeta", () => {
  const ok = { records: [], weekCount: 2, streak: 1, levelBefore: 3, levelAfter: 3 };
  it("полная meta завершения", () => {
    expect(isFinishMeta(ok)).toBe(true);
  });
  it("пустая, null и не объект — нет (иначе итоги недели падают на records)", () => {
    expect(isFinishMeta({})).toBe(false);
    expect(isFinishMeta(null)).toBe(false);
    expect(isFinishMeta("x")).toBe(false);
  });
  it("без массива рекордов или числа тренировок недели — нет", () => {
    expect(isFinishMeta({ ...ok, records: null })).toBe(false);
    expect(isFinishMeta({ ...ok, weekCount: undefined })).toBe(false);
  });
});

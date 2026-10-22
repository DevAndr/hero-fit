import { describe, expect, it } from "vitest";
import { togetherLabel } from "./my-coach-label";

describe("togetherLabel", () => {
  it("сегодня", () => {
    expect(togetherLabel("2026-10-22", "2026-10-22")).toBe("начали сегодня");
  });
  it("дни до двух недель", () => {
    expect(togetherLabel("2026-10-21", "2026-10-22")).toBe("вместе 1 день");
    expect(togetherLabel("2026-10-19", "2026-10-22")).toBe("вместе 3 дня");
    expect(togetherLabel("2026-10-09", "2026-10-22")).toBe("вместе 13 дней");
  });
  it("недели до двух месяцев", () => {
    expect(togetherLabel("2026-10-08", "2026-10-22")).toBe("вместе 2 недели");
    expect(togetherLabel("2026-08-24", "2026-10-22")).toBe("вместе 8 недель");
  });
  it("месяцы", () => {
    expect(togetherLabel("2026-08-23", "2026-10-22")).toBe("вместе 2 месяца");
    expect(togetherLabel("2025-10-22", "2026-10-22")).toBe("вместе 12 месяцев");
    expect(togetherLabel("2026-05-22", "2026-10-22")).toBe("вместе 5 месяцев");
  });
});

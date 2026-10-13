import { describe, expect, it } from "vitest";
import { addDays, weekdayOf, weekStart } from "./dates";

describe("addDays", () => {
  it("через месяц, год и назад", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });
  it("переход на летнее время пояса процесса не сдвигает день", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("weekdayOf / weekStart", () => {
  it("0 — понедельник, 6 — воскресенье", () => {
    expect(weekdayOf("2026-10-12")).toBe(0);
    expect(weekdayOf("2026-10-18")).toBe(6);
  });
  it("понедельник недели", () => {
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});

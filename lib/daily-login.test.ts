import { describe, expect, it } from "vitest";
import { dayKey, nextLoginStreak, safeTimeZone } from "./daily-login";

describe("dayKey", () => {
  it("formats the calendar day in the given time zone", () => {
    const t = new Date("2026-10-06T22:30:00Z");
    expect(dayKey(t, "UTC")).toBe("2026-10-06");
    expect(dayKey(t, "Europe/Moscow")).toBe("2026-10-07"); // UTC+3 — уже следующий день
  });
});

describe("safeTimeZone", () => {
  it("accepts valid IANA zones and falls back to UTC", () => {
    expect(safeTimeZone("Asia/Novosibirsk")).toBe("Asia/Novosibirsk");
    expect(safeTimeZone("Mars/Olympus")).toBe("UTC");
    expect(safeTimeZone(undefined)).toBe("UTC");
  });
});

describe("nextLoginStreak", () => {
  it("first visit starts at 1", () => {
    expect(nextLoginStreak(null, "2026-10-06", 0)).toBe(1);
  });
  it("same day — unchanged (null = nothing to update)", () => {
    expect(nextLoginStreak("2026-10-06", "2026-10-06", 4)).toBeNull();
  });
  it("next calendar day — +1, also across month boundary", () => {
    expect(nextLoginStreak("2026-10-06", "2026-10-07", 4)).toBe(5);
    expect(nextLoginStreak("2026-10-31", "2026-11-01", 9)).toBe(10);
  });
  it("skipped a day — back to 1", () => {
    expect(nextLoginStreak("2026-10-04", "2026-10-06", 4)).toBe(1);
  });
});

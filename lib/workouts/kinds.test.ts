import { describe, expect, it } from "vitest";
import { formatClock, formatKm, formatPace, isDoneSet, parseClock, timedSetText } from "./kinds";

const done = "2026-10-15T10:00:00.000Z";

describe("isDoneSet", () => {
  it("strength sets need reps, timed and cardio need time", () => {
    expect(isDoneSet("REPS", { reps: 0, completedAt: done })).toBe(false);
    expect(isDoneSet("REPS", { reps: 5, completedAt: done })).toBe(true);
    expect(isDoneSet(undefined, { reps: 5, completedAt: done })).toBe(true);
    expect(isDoneSet("TIME", { reps: 0, durationSec: 60, completedAt: done })).toBe(true);
    expect(isDoneSet("CARDIO", { reps: 0, durationSec: 0, completedAt: done })).toBe(false);
    expect(isDoneSet("TIME", { reps: 0, durationSec: 60, completedAt: null })).toBe(false);
  });
});

describe("clock, pace, km", () => {
  it("parseClock", () => {
    expect(parseClock("1:30")).toBe(90);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("1:02:05")).toBe(3725);
    expect(parseClock("0:75")).toBe(0);
    expect(parseClock("abc")).toBe(0);
    expect(parseClock("")).toBe(0);
  });

  it("formatClock", () => {
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("formatPace and formatKm", () => {
    expect(formatPace(1720, 5200)).toBe("5:31/км");
    expect(formatPace(300, 900)).toBeNull();
    expect(formatKm(5200)).toBe("5,2 км");
    expect(formatKm(10000)).toBe("10 км");
  });
});

describe("time field on a phone keypad and set captions", () => {
  it("comma or dot work as the minutes separator", () => {
    expect(parseClock("1,30")).toBe(90);
    expect(parseClock("1.30")).toBe(90);
    expect(parseClock("28.40")).toBe(1720);
  });

  it("timedSetText", () => {
    expect(timedSetText("TIME", { durationSec: 90 })).toBe("1:30");
    expect(timedSetText("CARDIO", { durationSec: 1720, distanceM: 5200 })).toBe("5,2 км · 28:40 · 5:31/км");
    expect(timedSetText("CARDIO", { durationSec: 600, distanceM: 800 })).toBe("0,8 км · 10:00");
    expect(timedSetText("CARDIO", { durationSec: 1200, distanceM: null })).toBe("20:00");
  });
});

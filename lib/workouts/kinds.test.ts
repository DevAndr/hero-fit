import { describe, expect, it } from "vitest";
import { chartsDistance, formatClock, formatKm, formatPace, isDoneSet, parseClock, plannedTimedSets, timedSetText, isTimed, isStretch } from "./kinds";

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

describe("cardio time: a bare number means minutes", () => {
  it("«30» for a run is half an hour, not 30 seconds", () => {
    expect(parseClock("30", { bareMinutes: true })).toBe(1800);
    expect(parseClock("28:40", { bareMinutes: true })).toBe(1720);
    expect(parseClock("90")).toBe(90);
  });
});

describe("plannedTimedSets", () => {
  it("time and distance from last time, no weight or reps", () => {
    const last = [{ weight: 0, reps: 0, durationSec: 1720, distanceM: 5200 }, { weight: 0, reps: 0, durationSec: 600, distanceM: 2000 }];
    expect(plannedTimedSets(3, last)).toEqual([
      { weight: 0, reps: 0, durationSec: 1720, distanceM: 5200 },
      { weight: 0, reps: 0, durationSec: 600, distanceM: 2000 },
      { weight: 0, reps: 0, durationSec: 600, distanceM: 2000 },
    ]);
    expect(plannedTimedSets(1, [])).toEqual([{ weight: 0, reps: 0, durationSec: null, distanceM: null }]);
  });
});

describe("parseClock — одна цифра после запятой — доля минуты", () => {
  it("«1,5» — полторы минуты, а не 1:05", () => {
    expect(parseClock("1,5")).toBe(90);
    expect(parseClock("1.5")).toBe(90);
    expect(parseClock("45,5", { bareMinutes: true })).toBe(2730);
    // Две цифры — по-прежнему секунды, двоеточие — всегда часы-минуты-секунды
    expect(parseClock("1,05")).toBe(65);
    expect(parseClock("1:5")).toBe(65);
  });
});

describe("chartsDistance", () => {
  const session = (sets: { durationSec: number; distanceM: number | null }[]) => ({ sets });
  it("кардио с дистанцией — график по км; без дистанции (скакалка) и на время — по времени", () => {
    expect(chartsDistance("CARDIO", [session([{ durationSec: 600, distanceM: 2000 }])])).toBe(true);
    expect(chartsDistance("CARDIO", [session([{ durationSec: 600, distanceM: null }])])).toBe(false);
    expect(chartsDistance("TIME", [session([{ durationSec: 60, distanceM: null }])])).toBe(false);
  });
});

describe("STRETCH", () => {
  it("растяжка — вид на время", () => {
    expect(isTimed("STRETCH")).toBe(true);
    expect(isStretch("STRETCH")).toBe(true);
    expect(isStretch("TIME")).toBe(false);
    expect(isStretch(undefined)).toBe(false);
    expect(isDoneSet("STRETCH", { reps: 0, durationSec: 30, completedAt: 1 })).toBe(true);
    expect(isDoneSet("STRETCH", { reps: 0, durationSec: 0, completedAt: 1 })).toBe(false);
  });
  it("подпись подхода: секунды до минуты, дальше часы; × 2 для каждой стороны", () => {
    expect(timedSetText("STRETCH", { durationSec: 45 })).toBe("45 с");
    expect(timedSetText("STRETCH", { durationSec: 90 })).toBe("1:30");
    expect(timedSetText("STRETCH", { durationSec: 90 }, true)).toBe("1:30 × 2");
    expect(timedSetText("STRETCH", { durationSec: 45 }, true)).toBe("45 с × 2");
  });
});

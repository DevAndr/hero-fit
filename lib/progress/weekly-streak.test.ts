import { describe, expect, it } from "vitest";
import { addWeeks, daysLeftInWeek, localHour, localMidnight, weekKey, weeklyRuns, weeksBetween } from "./weekly-streak";

describe("weekKey", () => {
  it("Monday of the week in the user's time zone", () => {
    expect(weekKey(new Date("2026-10-11T20:30:00Z"), "Europe/Moscow")).toBe("2026-10-05"); // вс 23:30 МСК
    expect(weekKey(new Date("2026-10-11T21:30:00Z"), "Europe/Moscow")).toBe("2026-10-12"); // пн 00:30 МСК
  });

  it("extreme offsets: UTC−11 and UTC+14", () => {
    expect(weekKey(new Date("2026-10-12T05:00:00Z"), "Pacific/Pago_Pago")).toBe("2026-10-05"); // вс 18:00
    expect(weekKey(new Date("2026-10-11T10:30:00Z"), "Pacific/Kiritimati")).toBe("2026-10-12"); // пн 00:30
  });

  it("Monday itself and UTC", () => {
    expect(weekKey(new Date("2026-10-05T00:00:00Z"), "UTC")).toBe("2026-10-05");
    expect(weekKey(new Date("2026-10-04T23:59:59Z"), "UTC")).toBe("2026-09-28");
  });
});

describe("week arithmetic", () => {
  it("addWeeks and weeksBetween", () => {
    expect(addWeeks("2026-10-05", -1)).toBe("2026-09-28");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(weeksBetween("2026-09-28", "2026-10-12")).toBe(2);
    expect(weeksBetween("2026-10-12", "2026-09-28")).toBe(-2);
  });

  it("weeksBetween across a DST change", () => {
    expect(weeksBetween("2026-03-23", "2026-03-30")).toBe(1);
  });
});

describe("local time", () => {
  it("localMidnight is 00:00 in the zone", () => {
    expect(localMidnight("2026-10-08", "Europe/Moscow").toISOString()).toBe("2026-10-07T21:00:00.000Z");
    expect(localMidnight("2026-10-08", "UTC").toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(localMidnight("2026-03-29", "Europe/Berlin").toISOString()).toBe("2026-03-28T23:00:00.000Z"); // день перехода на летнее
  });

  it("daysLeftInWeek counts today", () => {
    expect(daysLeftInWeek(new Date("2026-10-10T15:00:00Z"), "UTC")).toBe(2); // сб
    expect(daysLeftInWeek(new Date("2026-10-05T15:00:00Z"), "UTC")).toBe(7); // пн
    expect(daysLeftInWeek(new Date("2026-10-11T15:00:00Z"), "UTC")).toBe(1); // вс
  });

  it("localHour", () => {
    expect(localHour(new Date("2026-10-10T09:30:00Z"), "Europe/Moscow")).toBe(12);
    expect(localHour(new Date("2026-10-10T23:30:00Z"), "UTC")).toBe(23);
  });
});

describe("weeklyRuns", () => {
  it("longest run of consecutive weeks and the run alive now", () => {
    const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-09-07", "2026-09-14", "2026-09-28"];
    expect(weeklyRuns(weeks, "2026-10-05")).toEqual({ best: 3, current: 1 }); // прошлая неделя ещё считается
    expect(weeklyRuns(weeks, "2026-10-12")).toEqual({ best: 3, current: 0 });
    expect(weeklyRuns([], "2026-10-05")).toEqual({ best: 0, current: 0 });
  });
});

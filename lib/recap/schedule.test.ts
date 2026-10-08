import { describe, expect, it } from "vitest";
import { isMondayAfter, isRecapWeek, recapWeekFor, shouldPushRecap } from "./schedule";

const MSK = "Europe/Moscow";

describe("recapWeekFor", () => {
  it("previous week in the user's time zone", () => {
    expect(recapWeekFor(new Date("2026-10-12T07:00:00Z"), MSK)).toBe("2026-10-05"); // пн 10:00
    expect(recapWeekFor(new Date("2026-10-11T22:30:00Z"), MSK)).toBe("2026-10-05"); // пн 01:30
    expect(recapWeekFor(new Date("2026-10-11T22:30:00Z"), "UTC")).toBe("2026-09-28"); // вс 22:30
  });

  it("far-off time zones", () => {
    expect(recapWeekFor(new Date("2026-10-11T10:00:00Z"), "Pacific/Kiritimati")).toBe("2026-10-05"); // пн 00:00 (UTC+14)
    expect(recapWeekFor(new Date("2026-10-12T06:59:00Z"), "America/Los_Angeles")).toBe("2026-09-28"); // вс 23:59
  });
});

describe("isMondayAfter", () => {
  it("monday from the given local hour only", () => {
    expect(isMondayAfter(new Date("2026-10-12T05:59:00Z"), MSK, 9)).toBe(false); // пн 08:59
    expect(isMondayAfter(new Date("2026-10-12T06:00:00Z"), MSK, 9)).toBe(true); // пн 09:00
    expect(isMondayAfter(new Date("2026-10-13T07:00:00Z"), MSK, 9)).toBe(false); // вт 10:00
  });
});

describe("shouldPushRecap", () => {
  const now = new Date("2026-10-12T06:30:00Z"); // пн 09:30 МСК
  const recap = { week: "2026-10-05", pushedAt: null, seenAt: null };

  it("monday after 09:00, not pushed and not seen", () => {
    expect(shouldPushRecap(recap, now, MSK)).toBe(true);
  });

  it("not after the user opened it or after a push", () => {
    expect(shouldPushRecap({ ...recap, seenAt: now }, now, MSK)).toBe(false);
    expect(shouldPushRecap({ ...recap, pushedAt: now }, now, MSK)).toBe(false);
  });

  it("not on tuesday and not for an older week", () => {
    expect(shouldPushRecap(recap, new Date("2026-10-13T07:00:00Z"), MSK)).toBe(false);
    expect(shouldPushRecap({ ...recap, week: "2026-09-28" }, now, MSK)).toBe(false);
  });
});

describe("isRecapWeek", () => {
  const now = new Date("2026-10-14T12:00:00Z"); // ср, текущая неделя — 2026-10-12

  it("invalid keys", () => {
    expect(isRecapWeek("abc", now, MSK)).toBe("invalid");
    expect(isRecapWeek("2026-10-07", now, MSK)).toBe("invalid"); // среда
    expect(isRecapWeek("2026-02-30", now, MSK)).toBe("invalid");
  });

  it("current and future weeks are not ended", () => {
    expect(isRecapWeek("2026-10-12", now, MSK)).toBe("not-ended");
    expect(isRecapWeek("2026-10-19", now, MSK)).toBe("not-ended");
  });

  it("ok up to 8 weeks back, then too old", () => {
    expect(isRecapWeek("2026-10-05", now, MSK)).toBe("ok");
    expect(isRecapWeek("2026-08-17", now, MSK)).toBe("ok");
    expect(isRecapWeek("2026-08-10", now, MSK)).toBe("too-old");
  });
});

import { describe, expect, it } from "vitest";
import { ALERT_HOURLY_MAX, shouldAlert } from "./alert";

const now = new Date("2026-10-15T12:00:00Z");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

describe("shouldAlert", () => {
  it("new or reopened group, not more than once an hour, and under the hourly cap", () => {
    expect(shouldAlert({ isNew: true, reopened: false, alertedAt: null }, now, 0)).toBe(true);
    expect(shouldAlert({ isNew: false, reopened: false, alertedAt: null }, now, 0)).toBe(false);
    expect(shouldAlert({ isNew: false, reopened: true, alertedAt: ago(30) }, now, 0)).toBe(false);
    expect(shouldAlert({ isNew: false, reopened: true, alertedAt: ago(61) }, now, 0)).toBe(true);
    expect(shouldAlert({ isNew: true, reopened: false, alertedAt: null }, now, ALERT_HOURLY_MAX)).toBe(false);
    expect(ALERT_HOURLY_MAX).toBe(20);
  });
});

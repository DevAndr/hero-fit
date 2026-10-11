import { describe, expect, it } from "vitest";
import { afterFailure, LOCK_MS, lockedFor, minutesLeft, WINDOW_MS } from "./throttle-rules";

const t0 = new Date("2026-10-10T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

describe("afterFailure", () => {
  it("первая неудача — окно с этого момента", () => {
    expect(afterFailure(null, t0, 5)).toEqual({ failures: 1, windowStart: t0, lockedUntil: null });
  });
  it("на пятой неудаче в окне — блокировка на 15 минут", () => {
    let r = afterFailure(null, t0, 5);
    for (let i = 1; i < 4; i++) r = afterFailure(r, at(i * 1000), 5);
    expect(r).toMatchObject({ failures: 4, lockedUntil: null });
    r = afterFailure(r, at(5000), 5);
    expect(r).toMatchObject({ failures: 5, lockedUntil: at(5000 + LOCK_MS) });
  });
  it("окно истекло — счёт заново", () => {
    const r = afterFailure({ failures: 4, windowStart: t0, lockedUntil: null }, at(WINDOW_MS + 1), 5);
    expect(r).toEqual({ failures: 1, windowStart: at(WINDOW_MS + 1), lockedUntil: null });
  });
  it("блокировка прошла — счёт заново", () => {
    const r = afterFailure({ failures: 5, windowStart: t0, lockedUntil: at(LOCK_MS) }, at(LOCK_MS + 1), 5);
    expect(r).toEqual({ failures: 1, windowStart: at(LOCK_MS + 1), lockedUntil: null });
  });
});

describe("lockedFor / minutesLeft", () => {
  it("сколько осталось", () => {
    const r = { failures: 5, windowStart: t0, lockedUntil: at(LOCK_MS) };
    expect(lockedFor(r, at(60_000))).toBe(LOCK_MS - 60_000);
    expect(lockedFor(r, at(LOCK_MS))).toBe(0);
    expect(lockedFor(null, t0)).toBe(0);
    expect(minutesLeft(LOCK_MS - 60_000)).toBe(14);
    expect(minutesLeft(1)).toBe(1);
  });
});

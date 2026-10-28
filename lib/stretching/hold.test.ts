import { describe, expect, it } from "vitest";
import { activeHold, holdState, holdTarget, startHold, stoppedSec } from "./hold";

describe("holdTarget — сколько держать", () => {
  it("введённое в подходе — главное", () => {
    expect(holdTarget({ durationSec: 45 }, 40)).toBe(45);
  });
  it("без введённого — прошлое", () => {
    expect(holdTarget({ durationSec: null }, 40)).toBe(40);
  });
  it("ни того ни другого — 30 с", () => {
    expect(holdTarget({ durationSec: null }, null)).toBe(30);
    expect(holdTarget({ durationSec: 0 }, 0)).toBe(30);
  });
});

describe("startHold / holdState — отсчёт от endsAt", () => {
  it("односторонняя — две фазы с паузой 5 с", () => {
    const run = startHold(0, 30, true);
    expect(run.phases).toHaveLength(2);
    expect(run.phases[0]).toEqual({ side: "first", endsAt: 30_000 });
    expect(run.phases[1]).toEqual({ side: "second", endsAt: 30_000 + 5_000 + 30_000 });
    expect(run.pauseMs).toBe(5000);
  });
  it("обычная — одна фаза без стороны", () => {
    const run = startHold(1_000, 20, false);
    expect(run.phases).toEqual([{ side: null, endsAt: 21_000 }]);
  });
  it("идёт первая сторона", () => {
    expect(holdState(startHold(0, 30, true), 10_200)).toEqual({ phase: 0, leftSec: 20, pausing: false, done: false });
  });
  it("пауза между сторонами", () => {
    const s = holdState(startHold(0, 30, true), 31_000);
    expect(s.pausing).toBe(true);
    expect(s.phase).toBe(1);
    expect(s.done).toBe(false);
  });
  it("вторая сторона", () => {
    expect(holdState(startHold(0, 30, true), 40_000)).toEqual({ phase: 1, leftSec: 25, pausing: false, done: false });
  });
  it("прыжок времени (вкладка спала) — сразу готово", () => {
    expect(holdState(startHold(0, 30, true), 10 * 60_000).done).toBe(true);
    expect(holdState(startHold(0, 30, false), 30_000).done).toBe(true);
  });
});

describe("stoppedSec — «Стоп»", () => {
  it("меньше 5 с — не засчитано", () => {
    expect(stoppedSec(startHold(0, 30, false), 4_000)).toBeNull();
  });
  it("целые секунды удержанного", () => {
    expect(stoppedSec(startHold(0, 30, false), 12_400)).toBe(12);
  });
  it("за текущую сторону — от её начала", () => {
    expect(stoppedSec(startHold(0, 30, true), 35_000 + 8_000)).toBe(8);
  });
  it("в паузе — первая сторона удержана целиком", () => {
    expect(stoppedSec(startHold(0, 30, true), 32_000)).toBe(30);
  });
  it("не больше цели", () => {
    expect(stoppedSec(startHold(0, 30, false), 90_000)).toBe(30);
  });
});

describe("activeHold — отсчёт живёт, пока его подход есть и не отмечен", () => {
  const hold = { setKey: "b", run: startHold(0, 30, false) };
  it("подход на месте и не выполнен — активен", () => {
    expect(activeHold(hold, [{ key: "a", completedAt: "x" }, { key: "b", completedAt: null }])).toBe(hold);
  });
  it("подход удалён — нет отсчёта", () => {
    expect(activeHold(hold, [{ key: "a", completedAt: null }])).toBeNull();
  });
  it("подход отмечен вручную — нет отсчёта", () => {
    expect(activeHold(hold, [{ key: "b", completedAt: "2026-10-28T12:00:00Z" }])).toBeNull();
  });
  it("отсчёта не было — null", () => {
    expect(activeHold(null, [{ key: "b", completedAt: null }])).toBeNull();
  });
});

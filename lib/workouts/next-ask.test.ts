import { describe, expect, it } from "vitest";
import { FRESH_FINISH_MS, hasUpcomingPlan, isFreshFinish, nextPresets, roundToHalfHour, shouldAskNext } from "./next-ask";

const NOW = new Date("2026-11-12T10:00:00Z");

describe("isFreshFinish", () => {
  it("только что", () => expect(isFreshFinish(new Date(NOW.getTime() - 60_000), NOW)).toBe(true));
  it("на границе окна — уже нет", () => expect(isFreshFinish(new Date(NOW.getTime() - FRESH_FINISH_MS), NOW)).toBe(false));
  it("без finishedAt", () => expect(isFreshFinish(null, NOW)).toBe(false));
});

describe("shouldAskNext", () => {
  const base = {
    enabled: true,
    owner: true,
    hasUpcoming: false,
    now: NOW,
    workout: { status: "COMPLETED", stretchOnly: false, finishedAt: new Date(NOW.getTime() - 5 * 60_000), scheduleAskedAt: null },
  };
  it("все условия", () => expect(shouldAskNext(base)).toBe(true));
  it("флаг выключен", () => expect(shouldAskNext({ ...base, enabled: false })).toBe(false));
  it("смотрит не владелец", () => expect(shouldAskNext({ ...base, owner: false })).toBe(false));
  it("не завершена", () => expect(shouldAskNext({ ...base, workout: { ...base.workout, status: "IN_PROGRESS" } })).toBe(false));
  it("растяжка", () => expect(shouldAskNext({ ...base, workout: { ...base.workout, stretchOnly: true } })).toBe(false));
  it("не свежая", () =>
    expect(shouldAskNext({ ...base, workout: { ...base.workout, finishedAt: new Date(NOW.getTime() - FRESH_FINISH_MS - 1) } })).toBe(false));
  it("уже спрашивали", () => expect(shouldAskNext({ ...base, workout: { ...base.workout, scheduleAskedAt: NOW } })).toBe(false));
  it("уже есть план на неделю", () => expect(shouldAskNext({ ...base, hasUpcoming: true })).toBe(false));
});

describe("roundToHalfHour", () => {
  it("07:10 → 07:00", () => expect(roundToHalfHour(7 * 60 + 10)).toBe("07:00"));
  it("07:20 → 07:30", () => expect(roundToHalfHour(7 * 60 + 20)).toBe("07:30"));
  it("07:15 → 07:30", () => expect(roundToHalfHour(7 * 60 + 15)).toBe("07:30"));
  it("23:50 → 00:00", () => expect(roundToHalfHour(23 * 60 + 50)).toBe("00:00"));
});

describe("nextPresets", () => {
  it("время начала в поясе пользователя, округлённое", () => {
    // 04:10 UTC = 07:10 в Москве
    expect(nextPresets(NOW, "Europe/Moscow", new Date("2026-11-12T04:10:00Z"))).toEqual({
      tomorrow: { date: "2026-11-13", time: "07:00" },
      dayAfter: { date: "2026-11-14", time: "07:00" },
    });
    expect(nextPresets(NOW, "Europe/Moscow", new Date("2026-11-12T04:20:00Z")).tomorrow.time).toBe("07:30");
  });
  it("23:50 → 00:00, но день слота — по календарю пользователя", () => {
    // Начало 23:50 по Москве 11-го, сейчас уже 01:00 12-го по Москве
    const now = new Date("2026-11-11T22:00:00Z");
    expect(nextPresets(now, "Europe/Moscow", new Date("2026-11-11T20:50:00Z"))).toEqual({
      tomorrow: { date: "2026-11-13", time: "00:00" },
      dayAfter: { date: "2026-11-14", time: "00:00" },
    });
  });
  it("без startedAt — 19:00", () =>
    expect(nextPresets(NOW, "Europe/Moscow", null)).toEqual({
      tomorrow: { date: "2026-11-13", time: "19:00" },
      dayAfter: { date: "2026-11-14", time: "19:00" },
    }));
});

describe("hasUpcomingPlan", () => {
  const tz = "Europe/Moscow"; // NOW = 13:00 по Москве 12-го
  const o = (date: string, time: string, status = "planned") => ({ date, time, status });
  it("пусто", () => expect(hasUpcomingPlan([], NOW, tz)).toBe(false));
  it("сегодня позже", () => expect(hasUpcomingPlan([o("2026-11-12", "19:00", "today")], NOW, tz)).toBe(true));
  it("сегодня раньше — уже прошло", () => expect(hasUpcomingPlan([o("2026-11-12", "09:00", "today")], NOW, tz)).toBe(false));
  it("выполненное не считается", () => expect(hasUpcomingPlan([o("2026-11-12", "19:00", "done")], NOW, tz)).toBe(false));
  it("через 7 дней — считается", () => expect(hasUpcomingPlan([o("2026-11-19", "12:00")], NOW, tz)).toBe(true));
  it("дальше 7 дней — нет", () => expect(hasUpcomingPlan([o("2026-11-19", "14:00")], NOW, tz)).toBe(false));
});

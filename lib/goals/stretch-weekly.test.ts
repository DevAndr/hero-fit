import { describe, expect, test } from "vitest";
import {
  goalStretchWeeks,
  stretchWeeks,
  weekDone,
  weeklyDeadline,
  weeklyStatus,
  weeklySums,
  type WeekSum,
} from "@/lib/goals/stretch-weekly";

// 2026-10-26 — понедельник
const thu = new Date("2026-10-29T10:00:00Z");
const fri = new Date("2026-10-30T10:00:00Z");

describe("stretchWeeks", () => {
  test("постановка в чт — первая неделя текущая", () => {
    const weeks = stretchWeeks(thu, 4, "UTC");
    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(weeks[3]).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
  test("постановка в пт — первая неделя следующая", () => {
    expect(stretchWeeks(fri, 2, "UTC")[0]).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
  test("день постановки — в поясе пользователя", () => {
    // чт 23:30 в UTC+3 — ещё четверг; чт 22:00Z — уже пятница 01:00
    expect(stretchWeeks(new Date("2026-10-29T20:30:00Z"), 2, "Etc/GMT-3")[0].start).toBe("2026-10-26");
    expect(stretchWeeks(new Date("2026-10-29T22:00:00Z"), 2, "Etc/GMT-3")[0].start).toBe("2026-11-02");
  });
  test("weeklyDeadline — воскресенье последней недели", () => {
    expect(weeklyDeadline(thu, 4, "UTC")).toBe("2026-11-22");
    expect(weeklyDeadline(fri, 2, "UTC")).toBe("2026-11-15");
  });
  test("недели поставленной цели — из createdAt и срока", () => {
    expect(goalStretchWeeks({ createdAt: thu, deadline: "2026-11-22" }, "UTC")).toEqual(stretchWeeks(thu, 4, "UTC"));
    expect(goalStretchWeeks({ createdAt: fri, deadline: "2026-11-15" }, "UTC")).toEqual(stretchWeeks(fri, 2, "UTC"));
    expect(goalStretchWeeks({ createdAt: thu, deadline: null }, "UTC")).toEqual([]);
  });
});

describe("weekDone", () => {
  test("минуты: 59 мин — мало, 60 — норма", () => {
    expect(weekDone("MINUTES", 60, { sessions: 3, sec: 3540 })).toBe(false);
    expect(weekDone("MINUTES", 60, { sessions: 1, sec: 3600 })).toBe(true);
  });
  test("сессии", () => {
    expect(weekDone("SESSIONS", 3, { sessions: 2, sec: 9000 })).toBe(false);
    expect(weekDone("SESSIONS", 3, { sessions: 3, sec: 60 })).toBe(true);
  });
});

describe("weeklySums", () => {
  test("воскресенье 23:30 в Etc/GMT-3 — ещё эта неделя, 00:30 понедельника — следующая", () => {
    const sums = weeklySums(
      [
        { finishedAt: new Date("2026-11-01T20:30:00Z"), sec: 120 },
        { finishedAt: new Date("2026-11-01T21:30:00Z"), sec: 300 },
      ],
      "Etc/GMT-3",
    );
    expect(sums.get("2026-10-26")).toEqual({ sessions: 1, sec: 120 });
    expect(sums.get("2026-11-02")).toEqual({ sessions: 1, sec: 300 });
  });
  test("сессии и секунды недели складываются", () => {
    const sums = weeklySums(
      [
        { finishedAt: new Date("2026-10-26T10:00:00Z"), sec: 600 },
        { finishedAt: new Date("2026-10-28T10:00:00Z"), sec: 900 },
      ],
      "UTC",
    );
    expect(sums.get("2026-10-26")).toEqual({ sessions: 2, sec: 1500 });
  });
});

describe("weeklyStatus", () => {
  const weeks = stretchWeeks(thu, 4, "UTC");
  const sums = new Map<string, WeekSum>([
    ["2026-10-26", { sessions: 3, sec: 1800 }],
    ["2026-11-02", { sessions: 2, sec: 1200 }],
  ]);

  test("текущая незакрытая неделя провалом не считается", () => {
    // вс второй недели: норма ещё не набрана, но неделя не кончилась
    const s = weeklyStatus(weeks, sums, "2026-11-08", 3, "SESSIONS");
    expect(s).toEqual({ done: 1, total: 4, current: { value: 2, target: 3 }, failedWeek: null, achieved: false });
  });
  test("failedWeek — первая прошедшая неделя без нормы", () => {
    const s = weeklyStatus(weeks, sums, "2026-11-10", 3, "SESSIONS");
    expect(s.failedWeek).toBe("2026-11-02");
    expect(s.current).toEqual({ value: 0, target: 3 });
    expect(weeklyStatus(weeks, new Map(), "2026-11-30", 3, "SESSIONS").failedWeek).toBe("2026-10-26");
  });
  test("минуты: значение недели — целые минуты", () => {
    expect(weeklyStatus(weeks, sums, "2026-11-04", 30, "MINUTES").current).toEqual({ value: 20, target: 30 });
  });
  test("вне недель цели — current null", () => {
    expect(weeklyStatus(stretchWeeks(fri, 2, "UTC"), sums, "2026-10-31", 3, "SESSIONS").current).toBeNull();
  });
  test("все недели засчитаны — достигнута", () => {
    const all = new Map(weeks.map((w) => [w.start, { sessions: 3, sec: 0 }]));
    expect(weeklyStatus(weeks, all, "2026-11-22", 3, "SESSIONS")).toMatchObject({ done: 4, total: 4, achieved: true, failedWeek: null });
  });
});

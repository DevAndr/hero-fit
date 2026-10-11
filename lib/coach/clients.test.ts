import { describe, expect, it } from "vitest";
import { clientDisplayName, clientWeek, lastWorkoutLabel, sortClients, type ClientRow } from "./clients";

const NOW = new Date("2026-10-09T12:00:00Z");
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const row = (id: string, over: Partial<ClientRow> = {}): ClientRow => ({
  id,
  name: id,
  level: 1,
  lastWorkoutAt: ago(DAY),
  linkedAt: ago(30 * DAY),
  weekCount: 0,
  streak: 0,
  hints: 0,
  timeZone: "Europe/Moscow",
  plan: null,
  signals: [],
  ...over,
});

describe("clientDisplayName", () => {
  it("ник, иначе имя, иначе «Клиент»", () => {
    expect(clientDisplayName({ nickname: "iron", name: "Иван" })).toBe("iron");
    expect(clientDisplayName({ nickname: null, name: "Иван" })).toBe("Иван");
    expect(clientDisplayName({ nickname: null, name: null })).toBe("Клиент");
  });
});

describe("sortClients", () => {
  it("сначала с сигналами (больше — выше, при равенстве давние выше, без тренировок — выше всех), затем по свежести", () => {
    const rows = [
      row("fresh", { lastWorkoutAt: ago(3_600_000) }),
      row("oneOld", { lastWorkoutAt: ago(10 * DAY), signals: ["INACTIVE"] }),
      row("two", { lastWorkoutAt: ago(2 * DAY), signals: ["MISSED_PLAN", "STALLED"] }),
      row("oneNever", { lastWorkoutAt: null, signals: ["INACTIVE"] }),
      row("oneRecent", { lastWorkoutAt: ago(2 * DAY), signals: ["STALLED"] }),
      row("day", { lastWorkoutAt: ago(DAY), hints: 3 }),
    ];
    expect(sortClients(rows).map((r) => r.id)).toEqual(["two", "oneNever", "oneOld", "oneRecent", "fresh", "day"]);
  });
});

describe("lastWorkoutLabel", () => {
  const tz = "Europe/Moscow";
  it("календарные дни в поясе клиента", () => {
    const now = new Date("2026-10-09T21:30:00Z"); // 00:30 МСК 10 октября
    expect(lastWorkoutLabel(new Date("2026-10-09T20:30:00Z"), now, tz)).toBe("вчера"); // 23:30 МСК 9 октября
    expect(lastWorkoutLabel(new Date("2026-10-09T21:10:00Z"), now, tz)).toBe("сегодня");
  });

  it("N дней назад и без тренировок", () => {
    expect(lastWorkoutLabel(null, NOW, tz)).toBe("ещё не тренировался");
    expect(lastWorkoutLabel(ago(3 * DAY), NOW, tz)).toBe("3 дня назад");
    expect(lastWorkoutLabel(ago(5 * DAY), NOW, tz)).toBe("5 дней назад");
    expect(lastWorkoutLabel(ago(21 * DAY), NOW, tz)).toBe("21 день назад");
  });
});

describe("clientWeek — неделя и серия в поясе клиента", () => {
  const fields = { currentStreak: 3, lastStreakWeek: "2026-10-05", streakFreezes: 0, weekWorkouts: 2, weekWorkoutsKey: "2026-10-05", freezeGrantedAt: null };
  it("тренировки этой недели и живая серия", () => {
    expect(clientWeek(fields, NOW, "Europe/Moscow")).toEqual({ weekCount: 2, streak: 3 });
  });
  it("счётчик другой недели не считается", () => {
    expect(clientWeek({ ...fields, weekWorkoutsKey: "2026-09-28" }, NOW, "Europe/Moscow").weekCount).toBe(0);
  });
  it("понедельник у клиента наступил раньше, чем на сервере (UTC)", () => {
    // вс 22:30 UTC = пн 01:30 во Владивостоке: у клиента уже новая неделя
    const sundayNight = new Date("2026-10-11T22:30:00Z");
    expect(clientWeek(fields, sundayNight, "Asia/Vladivostok").weekCount).toBe(0);
    expect(clientWeek(fields, sundayNight, "UTC").weekCount).toBe(2);
  });
});

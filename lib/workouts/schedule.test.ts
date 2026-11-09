import { describe, expect, it } from "vitest";
import { schedulePresets, shouldAskSchedule, slotError } from "./schedule";

describe("shouldAskSchedule", () => {
  const w = { status: "PLANNED", planKey: null, courseId: null, scheduleAskedAt: null };
  it("новичок с черновиком", () => expect(shouldAskSchedule(w, 0)).toBe(true));
  it("есть завершённые", () => expect(shouldAskSchedule(w, 1)).toBe(false));
  it("уже привязан", () => expect(shouldAskSchedule({ ...w, planKey: "e:1" }, 0)).toBe(false));
  it("уже спрашивали", () => expect(shouldAskSchedule({ ...w, scheduleAskedAt: new Date() }, 0)).toBe(false));
  it("занятие курса", () => expect(shouldAskSchedule({ ...w, courseId: "c" }, 0)).toBe(false));
  it("идёт тренировка", () => expect(shouldAskSchedule({ ...w, status: "IN_PROGRESS" }, 0)).toBe(false));
});

describe("schedulePresets", () => {
  it("до 18:00 — сегодня и завтра в 19:00", () => {
    expect(schedulePresets(new Date("2026-11-09T14:59:00Z"), "Europe/Moscow")).toEqual({
      evening: { date: "2026-11-09", time: "19:00" },
      tomorrow: { date: "2026-11-10", time: "19:00" },
    });
  });
  it("с 18:00 вечера нет", () =>
    expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Europe/Moscow").evening).toBeNull());
  it("считает по поясу пользователя", () => {
    // 15:00 UTC: в Москве 18:00 (поздно), в Лондоне 15:00 (можно), в Токио уже 00:00 следующего дня
    expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Europe/London").evening).toEqual({
      date: "2026-11-09",
      time: "19:00",
    });
    expect(schedulePresets(new Date("2026-11-09T15:00:00Z"), "Asia/Tokyo").evening).toEqual({
      date: "2026-11-10",
      time: "19:00",
    });
  });
});

describe("slotError", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  it("будущее — ок", () =>
    expect(slotError({ date: "2026-11-10", time: "08:00" }, now, "Europe/Moscow")).toBeNull());
  it("прошлое — ошибка", () =>
    expect(slotError({ date: "2026-11-09", time: "14:00" }, now, "Europe/Moscow")).toBe("Выберите время в будущем"));
  it("30 дней — ок, 31 — нет", () => {
    expect(slotError({ date: "2026-12-09", time: "08:00" }, now, "Europe/Moscow")).toBeNull();
    expect(slotError({ date: "2026-12-10", time: "08:00" }, now, "Europe/Moscow")).toBe(
      "Можно запланировать не дальше чем на 30 дней",
    );
  });
});

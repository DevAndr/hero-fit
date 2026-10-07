import { describe, expect, it } from "vitest";
import { shouldRemindStreak, STREAK_REMINDER_HOURS } from "./reminders";

const H = 3_600_000;
const last = new Date("2026-10-01T18:00:00Z");
const at = (h: number) => new Date(last.getTime() + h * H);
const user = { currentStreak: 5, lastStreakAt: last, streakFreezes: 0, streakReminderFor: null };

describe("shouldRemindStreak", () => {
  it(`reminds when ≤ ${STREAK_REMINDER_HOURS}h are left before the 48h deadline`, () => {
    expect(shouldRemindStreak(user, at(44))).toBeNull(); // осталось 4 ч
    expect(shouldRemindStreak(user, at(45.5))).toEqual({ hoursLeft: 3 });
    expect(shouldRemindStreak(user, at(47.9))).toEqual({ hoursLeft: 1 });
  });

  it("only once per streak window", () => {
    expect(shouldRemindStreak({ ...user, streakReminderFor: last }, at(46))).toBeNull();
    // Новое окно (тренировка продлила серию) — снова можно напомнить
    expect(shouldRemindStreak({ ...user, streakReminderFor: at(-30) }, at(46))).toEqual({ hoursLeft: 2 });
  });

  it("no reminder without a streak, after the deadline or while today is counted", () => {
    expect(shouldRemindStreak({ ...user, currentStreak: 0 }, at(46))).toBeNull();
    expect(shouldRemindStreak(user, at(49))).toBeNull();
    expect(shouldRemindStreak(user, at(10))).toBeNull();
  });
});

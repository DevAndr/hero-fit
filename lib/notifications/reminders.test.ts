import { describe, expect, it } from "vitest";
import { shouldRemindStreak, streakReminderBody } from "./reminders";

// Неделя 2026-10-05: пт — 10-09, сб — 10-10, вс — 10-11.
const user = {
  currentStreak: 4,
  lastStreakWeek: "2026-09-28",
  streakFreezes: 0,
  weekWorkouts: 1,
  weekWorkoutsKey: "2026-10-05",
  freezeGrantedAt: new Date("2026-10-01T00:00:00Z"),
  streakReminderDay: null,
};
const sat15 = new Date("2026-10-10T15:00:00Z");

describe("shouldRemindStreak", () => {
  it("when the workouts still needed take all remaining days of the week", () => {
    expect(shouldRemindStreak(user, sat15, "UTC")).toEqual({ streak: 4, needed: 2 }); // сб, 1/3: нужно 2, осталось 2 дня
    expect(shouldRemindStreak({ ...user, weekWorkouts: 2 }, sat15, "UTC")).toBeNull(); // сб, 2/3: успевает
    expect(shouldRemindStreak({ ...user, weekWorkouts: 2 }, new Date("2026-10-11T15:00:00Z"), "UTC")).toEqual({
      streak: 4,
      needed: 1,
    }); // вс, 2/3
    expect(shouldRemindStreak({ ...user, weekWorkouts: 0 }, new Date("2026-10-09T15:00:00Z"), "UTC")).toEqual({
      streak: 4,
      needed: 3,
    }); // пт, 0/3
    expect(shouldRemindStreak(user, new Date("2026-10-08T15:00:00Z"), "UTC")).toBeNull(); // чт — рано
  });

  it("not before noon, not twice a day", () => {
    expect(shouldRemindStreak(user, new Date("2026-10-10T11:00:00Z"), "UTC")).toBeNull();
    expect(shouldRemindStreak({ ...user, streakReminderDay: "2026-10-10" }, sat15, "UTC")).toBeNull();
    expect(shouldRemindStreak({ ...user, streakReminderDay: "2026-10-09" }, sat15, "UTC")).toEqual({ streak: 4, needed: 2 });
  });

  it("no reminder without a live streak or once the week is credited", () => {
    expect(shouldRemindStreak({ ...user, currentStreak: 0 }, sat15, "UTC")).toBeNull();
    expect(shouldRemindStreak({ ...user, lastStreakWeek: "2026-10-05", weekWorkouts: 3 }, sat15, "UTC")).toBeNull();
    expect(shouldRemindStreak({ ...user, lastStreakWeek: "2026-09-14" }, sat15, "UTC")).toBeNull(); // уже сгорела
  });

  it("uses the user's local day and hour (UTC+14)", () => {
    // пт 2026-10-09 22:30 UTC = сб 2026-10-10 12:30 на Киритимати
    expect(shouldRemindStreak(user, new Date("2026-10-09T22:30:00Z"), "Pacific/Kiritimati")).toEqual({ streak: 4, needed: 2 });
  });

  it("body text", () => {
    expect(streakReminderBody({ streak: 4, needed: 2 })).toBe("Серия 4 недели — нужно ещё 2 тренировки до конца воскресенья.");
    expect(streakReminderBody({ streak: 1, needed: 1 })).toBe("Серия 1 неделя — нужно ещё 1 тренировка до конца воскресенья.");
  });
});

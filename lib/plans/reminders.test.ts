import { describe, expect, it } from "vitest";
import type { Occurrence } from "./expand";
import { duePlanReminders, planReminderText } from "./reminders";

const occ = (key: string, date: string, time: string): Occurrence => ({
  key,
  seriesId: null,
  date,
  time,
  durationMin: 60,
  templateId: null,
  title: "Ноги",
  recurring: false,
  coachId: null,
});
// 2026-10-08 15:30 МСК
const now = new Date("2026-10-08T12:30:00Z");
const base = { now, tz: "Europe/Moscow", leadMin: 60, sentKeys: new Set<string>(), doneKeys: new Set<string>(), hasActiveWorkout: false };

describe("duePlanReminders", () => {
  it("start within (now, now + lead]", () => {
    const list = [occ("a", "2026-10-08", "16:00"), occ("b", "2026-10-08", "16:30"), occ("c", "2026-10-08", "16:31"), occ("d", "2026-10-08", "15:30")];
    expect(duePlanReminders(list, base).map((o) => o.key)).toEqual(["a", "b"]);
  });

  it("skips sent, done and everything while a workout is in progress", () => {
    const list = [occ("a", "2026-10-08", "16:00"), occ("b", "2026-10-08", "16:15")];
    expect(duePlanReminders(list, { ...base, sentKeys: new Set(["a"]), doneKeys: new Set(["b"]) })).toEqual([]);
    expect(duePlanReminders(list, { ...base, hasActiveWorkout: true })).toEqual([]);
  });

  it("window crosses midnight; local time zone (UTC+14)", () => {
    const late = new Date("2026-10-08T20:30:00Z"); // 23:30 МСК
    expect(duePlanReminders([occ("n", "2026-10-09", "00:15")], { ...base, now: late }).map((o) => o.key)).toEqual(["n"]);
    // 2026-10-08 12:30Z = 2026-10-09 02:30 на Киритимати
    expect(duePlanReminders([occ("k", "2026-10-09", "03:00")], { ...base, tz: "Pacific/Kiritimati" }).map((o) => o.key)).toEqual(["k"]);
  });

  it("text", () => {
    expect(planReminderText(occ("a", "2026-10-08", "18:00"), 5, "2026-10-08")).toEqual({ title: "Сегодня по плану: Ноги 💪", body: "В 18:00 · 5 упражнений" });
    expect(planReminderText(occ("a", "2026-10-09", "00:15"), null, "2026-10-08")).toEqual({ title: "Скоро по плану: Ноги 💪", body: "В 00:15" });
  });
});

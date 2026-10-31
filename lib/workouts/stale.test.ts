import { describe, expect, it } from "vitest";
import { STALE_CANCEL_HOURS, STALE_REMIND_HOURS, staleReminderBody, staleWorkoutAction } from "./stale";

const H = 3_600_000;
const now = new Date("2026-10-29T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * H);
const w = (startedH: number, idleH: number, reminded = false) => ({ startedAt: ago(startedH), updatedAt: ago(idleH), staleRemindedAt: reminded ? ago(1) : null });

describe("staleWorkoutAction", () => {
  it("thresholds: remind after 4 h, cancel after 24 h", () => {
    expect(STALE_REMIND_HOURS).toBe(4);
    expect(STALE_CANCEL_HOURS).toBe(24);
  });

  it("does nothing before 4 hours, even without activity", () => {
    expect(staleWorkoutAction(w(3.9, 3.9), now)).toBeNull();
  });

  it("reminds after 4 hours when there was no activity for an hour", () => {
    expect(staleWorkoutAction(w(4, 1), now)).toBe("remind");
    expect(staleWorkoutAction(w(10, 9), now)).toBe("remind");
  });

  it("does not remind while the user is still logging sets", () => {
    expect(staleWorkoutAction(w(5, 0.9), now)).toBeNull();
  });

  it("reminds only once", () => {
    expect(staleWorkoutAction(w(6, 2, true), now)).toBeNull();
  });

  it("cancels after 24 hours regardless of activity and the reminder", () => {
    expect(staleWorkoutAction(w(24, 0), now)).toBe("cancel");
    expect(staleWorkoutAction(w(30, 20, true), now)).toBe("cancel");
    expect(staleWorkoutAction(w(23.9, 5, true), now)).toBeNull();
  });
});

describe("staleReminderBody", () => {
  it("names the workout and whole hours", () => {
    expect(staleReminderBody("Грудь", ago(5.7), now)).toBe("«Грудь» идёт уже 5 ч — завершите или отмените её");
  });
});

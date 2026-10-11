import { describe, expect, test } from "vitest";
import { goalDue, goalTickAction, initialReminderAt } from "@/lib/goals/tick-rules";

// Срок 2026-10-20 в UTC → конец 2026-10-21T00:00Z, фора на офлайн-тренировки — 24 ч
const goal = { type: "WORKOUTS" as const, target: 10, startValue: 0, deadline: "2026-10-20", reminderAt: null };
const at = (iso: string) => new Date(iso);

describe("goalTickAction", () => {
  test("выполнена до конца срока — засчитать", () => {
    expect(goalTickAction(goal, 10, at("2026-10-20T23:00:00Z"), "UTC")).toBe("achieve");
  });
  test("в форе после срока тик не засчитывает (это делает только финиш офлайн-тренировки)", () => {
    expect(goalTickAction(goal, 10, at("2026-10-21T23:00:00Z"), "UTC")).toBeNull();
  });
  test("не выполнена, фора ещё идёт — ждать", () => {
    expect(goalTickAction(goal, 9, at("2026-10-21T23:59:00Z"), "UTC")).toBeNull();
  });
  test("фора кончилась — провал", () => {
    expect(goalTickAction(goal, 9, at("2026-10-22T00:00:00Z"), "UTC")).toBe("fail");
    expect(goalTickAction(goal, 10, at("2026-10-22T00:00:00Z"), "UTC")).toBe("fail");
  });
  test("за 7 дней до срока — напомнить один раз", () => {
    expect(goalTickAction(goal, 3, at("2026-10-14T12:00:00Z"), "UTC")).toBe("remind");
    expect(goalTickAction({ ...goal, reminderAt: at("2026-10-14T12:00:00Z") }, 3, at("2026-10-15T12:00:00Z"), "UTC")).toBeNull();
    expect(goalTickAction(goal, 3, at("2026-10-13T23:00:00Z"), "UTC")).toBeNull();
  });
  test("без срока", () => {
    expect(goalTickAction({ ...goal, deadline: null }, 3, at("2030-01-01T00:00:00Z"), "UTC")).toBeNull();
    expect(goalTickAction({ ...goal, deadline: null }, 10, at("2030-01-01T00:00:00Z"), "UTC")).toBe("achieve");
  });
});

describe("goalDue — тику нужно считать значение цели", () => {
  test("только в окне напоминания или после форы", () => {
    expect(goalDue(goal, at("2026-10-10T12:00:00Z"), "UTC")).toBe(false);
    expect(goalDue(goal, at("2026-10-14T12:00:00Z"), "UTC")).toBe(true);
    expect(goalDue({ ...goal, reminderAt: at("2026-10-14T12:00:00Z") }, at("2026-10-21T12:00:00Z"), "UTC")).toBe(false);
    expect(goalDue({ ...goal, reminderAt: at("2026-10-14T12:00:00Z") }, at("2026-10-22T00:00:00Z"), "UTC")).toBe(true);
    expect(goalDue({ ...goal, deadline: null }, at("2026-10-22T00:00:00Z"), "UTC")).toBe(false);
  });
});

test("initialReminderAt — короткий срок без напоминания «7 дней»", () => {
  const now = at("2026-10-15T12:00:00Z");
  expect(initialReminderAt("2026-10-20", now, "UTC")).toEqual(now);
  expect(initialReminderAt("2026-10-30", now, "UTC")).toBeNull();
  expect(initialReminderAt(null, now, "UTC")).toBeNull();
});

import { describe, expect, test } from "vitest";
import { goalDue, goalTickAction, initialReminderAt, weeklyTickAction } from "@/lib/goals/tick-rules";
import type { WeekSum } from "@/lib/goals/stretch-weekly";

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

describe("weeklyTickAction — регулярность растяжки (флаг в правило не передаётся: тик от него не зависит)", () => {
  // Постановка в чт 2026-10-29: недели 26.10–01.11, 02.11–08.11; срок 2026-11-08
  const weekly = {
    type: "STRETCH_WEEKLY" as const,
    createdAt: at("2026-10-29T10:00:00Z"),
    deadline: "2026-11-08",
    target: 2,
    stretchUnit: "SESSIONS" as const,
    reminderAt: at("2026-10-29T10:00:00Z"),
  };
  const first = new Map<string, WeekSum>([["2026-10-26", { sessions: 1, sec: 300 }]]);

  test("неделя без нормы — провал после конца недели и форы 24 ч", () => {
    expect(weeklyTickAction(weekly, first, at("2026-11-02T12:00:00Z"), "UTC")).toBeNull();
    expect(weeklyTickAction(weekly, first, at("2026-11-02T23:59:00Z"), "UTC")).toBeNull();
    expect(weeklyTickAction(weekly, first, at("2026-11-03T00:00:00Z"), "UTC")).toBe("fail");
  });
  test("норма недели набрана — ждём следующую", () => {
    const ok = new Map<string, WeekSum>([["2026-10-26", { sessions: 2, sec: 300 }]]);
    expect(weeklyTickAction(weekly, ok, at("2026-11-05T12:00:00Z"), "UTC")).toBeNull();
    // последняя неделя не набрана — провал после форы
    expect(weeklyTickAction(weekly, ok, at("2026-11-10T00:00:00Z"), "UTC")).toBe("fail");
  });
  test("все недели засчитаны — засчитать", () => {
    const all = new Map<string, WeekSum>([
      ["2026-10-26", { sessions: 2, sec: 0 }],
      ["2026-11-02", { sessions: 3, sec: 0 }],
    ]);
    expect(weeklyTickAction(weekly, all, at("2026-11-08T12:00:00Z"), "UTC")).toBe("achieve");
  });
  test("неделя — в поясе пользователя", () => {
    // UTC+3: неделя кончилась 2026-11-01T21:00Z, фора — до 2026-11-02T21:00Z
    expect(weeklyTickAction(weekly, first, at("2026-11-02T20:59:00Z"), "Etc/GMT-3")).toBeNull();
    expect(weeklyTickAction(weekly, first, at("2026-11-02T21:00:00Z"), "Etc/GMT-3")).toBe("fail");
  });
  test("напоминание за 7 дней — как у обычных целей", () => {
    expect(weeklyTickAction({ ...weekly, reminderAt: null }, first, at("2026-11-02T12:00:00Z"), "UTC")).toBe("remind");
  });
  test("goalDue: регулярность — только в окне после закрытия недели (с форой), не на каждом тике", () => {
    expect(goalDue(weekly, at("2026-11-02T12:00:00Z"), "UTC")).toBe(false);
    // неделя 26.10–01.11 закрыта с форой — окно 2 дня
    expect(goalDue(weekly, at("2026-11-03T00:00:00Z"), "UTC")).toBe(true);
    expect(goalDue(weekly, at("2026-11-04T23:59:00Z"), "UTC")).toBe(true);
    // середина следующей недели — не проверяем
    expect(goalDue(weekly, at("2026-11-05T12:00:00Z"), "UTC")).toBe(false);
    // срок + фора — как у всех целей
    expect(goalDue(weekly, at("2026-11-10T00:00:00Z"), "UTC")).toBe(true);
  });
  test("постановка в пт: дни до первой недели не дают ни сессий, ни провала", () => {
    // пт 2026-10-30 → недели 02.11–08.11, 09.11–15.11
    const fri = { ...weekly, createdAt: at("2026-10-30T10:00:00Z"), deadline: "2026-11-15" };
    const before = new Map<string, WeekSum>([["2026-10-26", { sessions: 5, sec: 3000 }]]);
    expect(goalDue(fri, at("2026-11-03T00:00:00Z"), "UTC")).toBe(false);
    expect(weeklyTickAction(fri, before, at("2026-11-03T00:00:00Z"), "UTC")).toBeNull();
    // первая неделя прошла пустой (сессии до неё не в счёт) — провал
    expect(goalDue(fri, at("2026-11-10T00:00:00Z"), "UTC")).toBe(true);
    expect(weeklyTickAction(fri, before, at("2026-11-10T00:00:00Z"), "UTC")).toBe("fail");
  });
});

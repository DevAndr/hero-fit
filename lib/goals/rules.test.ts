import { describe, expect, test } from "vitest";
import {
  canCreate,
  deadlineEnd,
  deadlineSchema,
  deadlineText,
  goalValueText,
  goalNotice,
  goalProgress,
  goalSchema,
  goalTitle,
  isAchieved,
  paceStatus,
  suggestGoals,
} from "@/lib/goals/rules";

const base = { createdAt: new Date("2026-10-01T00:00:00Z") };

describe("goalProgress", () => {
  test("сила — доля пути от старта к цели", () => {
    expect(goalProgress({ type: "STRENGTH", startValue: 60, target: 100 }, 80)).toBe(0.5);
    expect(goalProgress({ type: "STRENGTH", startValue: 60, target: 100 }, 120)).toBe(1);
    expect(goalProgress({ type: "STRENGTH", startValue: 60, target: 100 }, 50)).toBe(0);
  });

  test("счётчики — от нуля", () => {
    expect(goalProgress({ type: "WORKOUTS", startValue: 0, target: 50 }, 10)).toBe(0.2);
  });

  test("вес тела — сбросить и набрать", () => {
    const lose = { type: "BODY_WEIGHT", startValue: 90, target: 80 } as const;
    expect(goalProgress(lose, 85)).toBe(0.5);
    expect(goalProgress(lose, 95)).toBe(0);
    expect(goalProgress(lose, 78)).toBe(1);
    const gain = { type: "BODY_WEIGHT", startValue: 70, target: 75 } as const;
    expect(goalProgress(gain, 79)).toBe(1);
  });
});

describe("isAchieved", () => {
  test("вес тела — по направлению", () => {
    const lose = { type: "BODY_WEIGHT", startValue: 90, target: 80 } as const;
    expect(isAchieved(lose, 80)).toBe(true);
    expect(isAchieved(lose, 80.1)).toBe(false);
    const gain = { type: "BODY_WEIGHT", startValue: 70, target: 75 } as const;
    expect(isAchieved(gain, 75.2)).toBe(true);
    expect(isAchieved(gain, 74.9)).toBe(false);
  });

  test("остальные — не меньше цели", () => {
    expect(isAchieved({ type: "STREAK", startValue: 3, target: 12 }, 12)).toBe(true);
    expect(isAchieved({ type: "HOURS", startValue: 0, target: 30 }, 29.9)).toBe(false);
  });
});

test("deadlineEnd — местная полночь после дня срока", () => {
  expect(deadlineEnd("2026-12-31", "Asia/Tokyo").toISOString()).toBe("2026-12-31T15:00:00.000Z");
  expect(deadlineEnd("2026-12-31", "America/Los_Angeles").toISOString()).toBe("2027-01-01T08:00:00.000Z");
});

test("paceStatus", () => {
  const g = { ...base, deadline: "2026-10-31" };
  const mid = new Date("2026-10-16T12:00:00Z");
  expect(paceStatus({ ...base, deadline: null }, 0.1, mid, "UTC")).toBeNull();
  expect(paceStatus(g, 0.45, mid, "UTC")).toBe("ahead");
  expect(paceStatus(g, 0.3, mid, "UTC")).toBe("behind");
});

describe("canCreate", () => {
  const ctx = { active: [], current: 60, isBodyweight: false, hasWeight: true };
  const strength = { type: "STRENGTH", exerciseId: "e", metric: "MAX_WEIGHT", target: 100, deadline: null } as const;

  test("можно", () => {
    expect(canCreate(strength, ctx)).toBeNull();
  });
  test("уже достигнуто", () => {
    expect(canCreate({ ...strength, target: 60 }, ctx)).toBe("Уже достигнуто");
  });
  test("лимит активных", () => {
    expect(canCreate(strength, { ...ctx, active: Array(5).fill({ type: "WORKOUTS" }) })).toBe("Максимум 5 активных целей");
  });
  test("своё упражнение — только повторы", () => {
    expect(canCreate(strength, { ...ctx, isBodyweight: true })).toBe("Для упражнения со своим весом — только повторы");
    expect(canCreate({ ...strength, metric: "MAX_REPS", target: 20 }, { ...ctx, current: 10, isBodyweight: true })).toBeNull();
  });
  test("вес тела", () => {
    const w = { type: "BODY_WEIGHT", target: 80, deadline: null } as const;
    expect(canCreate(w, { ...ctx, active: [{ type: "BODY_WEIGHT" }], current: 90 })).toBe("Цель по весу уже есть");
    expect(canCreate(w, { ...ctx, current: 80 })).toBe("Уже достигнуто");
    expect(canCreate(w, { ...ctx, current: 90 })).toBeNull();
  });
});

describe("goalSchema", () => {
  test("пределы по типу", () => {
    expect(goalSchema.safeParse({ type: "STREAK", target: 105, deadline: null }).success).toBe(false);
    expect(goalSchema.safeParse({ type: "STREAK", target: 12, deadline: null }).success).toBe(true);
    expect(goalSchema.safeParse({ type: "STRENGTH", exerciseId: "e", metric: "MAX_REPS", target: 20.5, deadline: null }).success).toBe(false);
    expect(goalSchema.safeParse({ type: "STRENGTH", exerciseId: "e", metric: "MAX_WEIGHT", target: 72.5, deadline: null }).success).toBe(true);
    expect(goalSchema.safeParse({ type: "STRENGTH", exerciseId: "e", metric: "MAX_WEIGHT", target: 72.3, deadline: null }).success).toBe(false);
    expect(goalSchema.safeParse({ type: "BODY_WEIGHT", target: 80.3, deadline: null }).success).toBe(true);
    expect(goalSchema.safeParse({ type: "BODY_WEIGHT", target: 20, deadline: null }).success).toBe(false);
  });
  test("силовой нужны упражнение и метрика", () => {
    expect(goalSchema.safeParse({ type: "STRENGTH", target: 100, deadline: null }).success).toBe(false);
  });
});

test("deadlineSchema: завтра…2 года", () => {
  const s = deadlineSchema("2026-10-11");
  expect(s.safeParse("2026-10-11").success).toBe(false);
  expect(s.safeParse("2026-10-12").success).toBe(true);
  expect(s.safeParse("2028-10-11").success).toBe(true);
  expect(s.safeParse("2028-10-12").success).toBe(false);
  expect(s.safeParse(null).success).toBe(true);
  expect(s.safeParse("31.12.2026").success).toBe(false);
});

test("goalTitle", () => {
  expect(goalTitle({ type: "STRENGTH", metric: "MAX_WEIGHT", target: 100, startValue: 60, exerciseName: "Жим лёжа" })).toBe("Жим лёжа — 100 кг");
  expect(goalTitle({ type: "STRENGTH", metric: "MAX_WEIGHT", target: 72.5, startValue: 60, exerciseName: "Жим лёжа" })).toBe("Жим лёжа — 72,5 кг");
  expect(goalTitle({ type: "STRENGTH", metric: "ONE_RM", target: 110, startValue: 0, exerciseName: "Жим лёжа" })).toBe("Жим лёжа — 1ПМ 110 кг");
  expect(goalTitle({ type: "STRENGTH", metric: "MAX_REPS", target: 20, startValue: 0, exerciseName: "Подтягивания" })).toBe("Подтягивания — 20 повторов");
  expect(goalTitle({ type: "STRENGTH", metric: "MAX_REPS", target: 21, startValue: 0, exerciseName: "Подтягивания" })).toBe("Подтягивания — 21 повтор");
  expect(goalTitle({ type: "WORKOUTS", metric: null, target: 50, startValue: 0 })).toBe("50 тренировок");
  expect(goalTitle({ type: "WORKOUTS", metric: null, target: 22, startValue: 0 })).toBe("22 тренировки");
  expect(goalTitle({ type: "STREAK", metric: null, target: 12, startValue: 0 })).toBe("Серия 12 недель");
  expect(goalTitle({ type: "STREAK", metric: null, target: 1, startValue: 0 })).toBe("Серия 1 неделя");
  expect(goalTitle({ type: "HOURS", metric: null, target: 30, startValue: 0 })).toBe("30 часов в зале");
  expect(goalTitle({ type: "HOURS", metric: null, target: 2, startValue: 0 })).toBe("2 часа в зале");
  expect(goalTitle({ type: "BODY_WEIGHT", metric: null, target: 80, startValue: 90 })).toBe("Вес тела — 80 кг ↓");
  expect(goalTitle({ type: "BODY_WEIGHT", metric: null, target: 75.5, startValue: 70 })).toBe("Вес тела — 75,5 кг ↑");
});

describe("suggestGoals", () => {
  test("из частого упражнения и серии", () => {
    const s = suggestGoals({ topExercise: { id: "e", name: "Жим лёжа", workWeight: 72.5 }, streak: 3 }, "2026-10-11");
    expect(s.map((g) => g.target)).toEqual([80, 7, 20]);
    expect(s[0]).toMatchObject({ type: "STRENGTH", exerciseId: "e", metric: "MAX_WEIGHT", deadline: null });
    expect(s[2]).toMatchObject({ type: "WORKOUTS", deadline: "2026-12-11" });
    expect(s[0].title).toBe("Жим лёжа — 80 кг");
  });
  test("без истории", () => {
    const s = suggestGoals({ topExercise: null, streak: 0 }, "2026-10-11");
    expect(s.map((g) => [g.type, g.target])).toEqual([["STREAK", 4], ["WORKOUTS", 20]]);
  });
});

test("goalNotice", () => {
  expect(goalNotice("achieved", "Жим лёжа — 100 кг", 1)).toEqual({ title: "🎯 Цель достигнута", body: "Жим лёжа — 100 кг" });
  expect(goalNotice("reminder", "50 тренировок", 0.823)).toEqual({ title: "До срока цели 7 дней", body: "50 тренировок: пройдено 82 %" });
  expect(goalNotice("failed", "50 тренировок", 0.94)).toEqual({ title: "Срок цели вышел", body: "50 тренировок: пройдено 94 %. Поставить снова?" });
});

test("goalValueText", () => {
  expect(goalValueText({ type: "STRENGTH", metric: "MAX_WEIGHT" }, 0, 60)).toBe("0 / 60 кг");
  expect(goalValueText({ type: "STRENGTH", metric: "ONE_RM" }, 87.53, 100)).toBe("87,5 / 100 кг");
  expect(goalValueText({ type: "STRENGTH", metric: "MAX_REPS" }, 12, 20)).toBe("12 / 20 повторов");
  expect(goalValueText({ type: "WORKOUTS", metric: null }, 3, 50)).toBe("3 / 50 тренировок");
  expect(goalValueText({ type: "STREAK", metric: null }, 3, 12)).toBe("3 / 12 недель");
  expect(goalValueText({ type: "HOURS", metric: null }, 12.5, 30)).toBe("12,5 / 30 ч");
  expect(goalValueText({ type: "BODY_WEIGHT", metric: null }, 84.8, 80)).toBe("84,8 → 80 кг");
});

test("deadlineText", () => {
  expect(deadlineText("2026-12-31", "2026-10-11")).toBe("до 31 декабря · остался 81 день");
  expect(deadlineText("2026-10-12", "2026-10-11")).toBe("до 12 октября · остался 1 день");
  expect(deadlineText("2026-10-11", "2026-10-11")).toBe("до 11 октября · последний день");
  expect(deadlineText("2027-01-15", "2026-10-11")).toBe("до 15 января 2027 · осталось 96 дней");
});

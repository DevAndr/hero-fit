import { describe, expect, test } from "vitest";
import {
  againSkillStartCm,
  canCreate,
  deadlineEnd,
  deadlineSchema,
  deadlineText,
  goalValueText,
  goalNotice,
  goalOpenAt,
  goalProgress,
  goalSchema,
  goalTitle,
  isAchieved,
  isInputGoalType,
  isStretchGoal,
  paceStatus,
  suggestGoals,
  weeklyWeekText,
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

describe("goalOpenAt — срок ещё не вышел на момент", () => {
  test("офлайн-тренировка до конца срока засчитывается, после — нет", () => {
    const goal = { deadline: "2026-10-20" };
    expect(goalOpenAt(goal, new Date("2026-10-20T23:59:00Z"), "UTC")).toBe(true);
    expect(goalOpenAt(goal, new Date("2026-10-21T00:00:00Z"), "UTC")).toBe(false);
    expect(goalOpenAt(goal, new Date("2026-10-20T15:30:00Z"), "Asia/Tokyo")).toBe(false);
    expect(goalOpenAt({ deadline: null }, new Date("2030-01-01T00:00:00Z"), "UTC")).toBe(true);
  });
});

test("goalSchema: ошибки текущего веса — по-русски", () => {
  const r = goalSchema.safeParse({ type: "BODY_WEIGHT", target: 80, deadline: null, currentWeight: Number.NaN });
  expect(r.success).toBe(false);
  expect(r.error?.issues.find((i) => i.path[0] === "currentWeight")?.message).toBe("Вес — от 30 до 300 кг");
});

test("deadlineText: срок прошёл", () => {
  expect(deadlineText("2026-10-10", "2026-10-11")).toBe("до 10 октября · срок вышел");
});

describe("цель «Удержание»", () => {
  const hold = { type: "STRETCH_HOLD", exerciseId: "e", target: 90, deadline: null } as const;

  test("схема: упражнение и предел 10…600 с", () => {
    const noEx = goalSchema.safeParse({ type: "STRETCH_HOLD", target: 90, deadline: null });
    expect(noEx.success ? null : noEx.error.issues[0].message).toBe("Выбери упражнение");
    const low = goalSchema.safeParse({ ...hold, target: 5 });
    expect(low.success ? null : low.error.issues[0].message).toBe("От 10 до 600");
    expect(goalSchema.safeParse({ ...hold, target: 601 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...hold, target: 10.5 }).success).toBe(false);
    expect(goalSchema.safeParse(hold).success).toBe(true);
  });
  test("тексты", () => {
    expect(goalTitle({ type: "STRETCH_HOLD", metric: null, target: 90, startValue: 0, exerciseName: "Складка стоя" })).toBe("Складка стоя — удержание 1:30");
    expect(goalValueText({ type: "STRETCH_HOLD", metric: null }, 45, 90)).toBe("0:45 / 1:30");
  });
  test("достижение и «Уже достигнуто»", () => {
    expect(isAchieved({ type: "STRETCH_HOLD", startValue: 20, target: 90 }, 90)).toBe(true);
    expect(canCreate(hold, { active: [], current: 90, isBodyweight: false, hasWeight: true })).toBe("Уже достигнуто");
    expect(canCreate(hold, { active: [], current: 30, isBodyweight: false, hasWeight: true })).toBeNull();
  });
  test("isStretchGoal", () => {
    expect(isStretchGoal("STRETCH_HOLD")).toBe(true);
    expect(isStretchGoal("STRETCH_WEEKLY")).toBe(true);
    expect(isStretchGoal("STRENGTH")).toBe(false);
  });
});

describe("цель «Регулярность» (растяжка)", () => {
  const weekly = { type: "STRETCH_WEEKLY", stretchUnit: "SESSIONS", target: 3, weeks: 4, deadline: null } as const;
  const issue = (v: unknown) => {
    const r = goalSchema.safeParse(v);
    return r.success ? null : { message: r.error.issues[0].message, path: r.error.issues[0].path[0] };
  };

  test("схема: единица, норма сессий 1…7 / минут 5…300, 2…12 недель", () => {
    expect(issue({ ...weekly, stretchUnit: undefined })).toEqual({ message: "Выбери, что считаем", path: "stretchUnit" });
    expect(issue({ ...weekly, target: 8 })).toEqual({ message: "От 1 до 7", path: "target" });
    expect(issue({ ...weekly, target: 1.5 })).toEqual({ message: "От 1 до 7", path: "target" });
    expect(issue({ ...weekly, stretchUnit: "MINUTES", target: 4 })).toEqual({ message: "От 5 до 300", path: "target" });
    expect(issue({ ...weekly, stretchUnit: "MINUTES", target: 301 })).toEqual({ message: "От 5 до 300", path: "target" });
    expect(issue({ ...weekly, weeks: 1 })).toEqual({ message: "От 2 до 12 недель", path: "weeks" });
    expect(issue({ ...weekly, weeks: 13 })).toEqual({ message: "От 2 до 12 недель", path: "weeks" });
    expect(issue({ ...weekly, weeks: undefined })).toEqual({ message: "От 2 до 12 недель", path: "weeks" });
    expect(issue(weekly)).toBeNull();
    expect(issue({ ...weekly, stretchUnit: "MINUTES", target: 60, weeks: 12 })).toBeNull();
  });
  test("тексты: заголовок с числом недель (из createdAt и срока), прогресс недель, эта неделя", () => {
    const g = { type: "STRETCH_WEEKLY", metric: null, startValue: 0, createdAt: new Date("2026-10-29T10:00:00Z"), deadline: "2026-11-22" } as const;
    expect(goalTitle({ ...g, target: 3, stretchUnit: "SESSIONS" }, "UTC")).toBe("3 растяжки в неделю · 4 недели");
    expect(goalTitle({ ...g, target: 1, stretchUnit: "SESSIONS" }, "UTC")).toBe("1 растяжка в неделю · 4 недели");
    expect(goalTitle({ ...g, target: 60, stretchUnit: "MINUTES" }, "UTC")).toBe("60 минут растяжки в неделю · 4 недели");
    expect(goalValueText({ type: "STRETCH_WEEKLY", metric: null }, 0.5, 3, { done: 2, total: 4 })).toBe("2 из 4 недель");
    expect(goalValueText({ type: "STRETCH_WEEKLY", metric: null }, 0, 3, { done: 0, total: 2 })).toBe("0 из 2 недель");
    expect(weeklyWeekText("SESSIONS", { value: 1, target: 3 })).toBe("эта неделя: 1/3");
    expect(weeklyWeekText("MINUTES", { value: 20, target: 60 })).toBe("эта неделя: 20/60 мин");
  });
  test("значение — доля засчитанных недель: достигнута, когда засчитаны все", () => {
    const shape = { type: "STRETCH_WEEKLY", startValue: 0, target: 3 } as const;
    expect(isAchieved(shape, 1)).toBe(true);
    expect(isAchieved(shape, 0.75)).toBe(false);
    expect(goalProgress(shape, 0.5)).toBe(0.5);
    expect(goalProgress(shape, 0)).toBe(0);
  });
  test("темп не показывается: прогресс ступенчатый, темп — строка «эта неделя»", () => {
    const g = { type: "STRETCH_WEEKLY" as const, createdAt: new Date("2026-10-26T00:00:00Z"), deadline: "2026-11-22" };
    expect(paceStatus(g, 0, new Date("2026-11-20T12:00:00Z"), "UTC")).toBeNull();
    expect(paceStatus({ ...g, type: "WORKOUTS" }, 0, new Date("2026-11-20T12:00:00Z"), "UTC")).toBe("behind");
  });
  test("недели: нечисло — понятная ошибка", () => {
    expect(issue({ ...weekly, weeks: "4" })).toEqual({ message: "От 2 до 12 недель", path: "weeks" });
  });
  test("ставится с нуля — «Уже достигнуто» не бывает", () => {
    expect(canCreate(weekly, { active: [], current: 0, isBodyweight: false, hasWeight: true })).toBeNull();
  });
  test("уведомление о провале недели", () => {
    expect(goalNotice("weekFailed", "3 растяжки в неделю · 4 недели", 0.25)).toEqual({
      title: "Неделя без растяжки — цель «3 растяжки в неделю · 4 недели» не выполнена",
      body: "Пройдено 25 %. Поставить снова?",
    });
  });
});

describe("цель «Навык»", () => {
  const skill = { type: "STRETCH_SKILL" as const, stretchSkill: "FOLD_STANDING" as const, startCm: 10, target: 0, deadline: null };

  test("схема: навык или своё название, стартовый замер 0,5…200 шаг 0,5", () => {
    expect(goalSchema.safeParse(skill).success).toBe(true);
    expect(goalSchema.safeParse({ ...skill, stretchSkill: undefined }).success).toBe(false);
    expect(goalSchema.safeParse({ ...skill, stretchSkill: undefined, skillTitle: "Складка у стены" }).success).toBe(true);
    expect(goalSchema.safeParse({ ...skill, stretchSkill: undefined, skillTitle: "x".repeat(61) }).success).toBe(false);
    expect(goalSchema.safeParse({ ...skill, startCm: 0 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...skill, startCm: 200.5 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...skill, startCm: 10.3 }).success).toBe(false);
    expect(goalSchema.safeParse({ ...skill, startCm: 12.5 }).success).toBe(true);
    expect(goalSchema.safeParse({ ...skill, target: 5 }).success).toBe(false);
    expect(isInputGoalType("STRETCH_SKILL")).toBe(true);
  });

  test("canCreate: одна активная цель на навык", () => {
    const ctx = { active: [{ type: "STRETCH_SKILL" as const, stretchSkill: "FOLD_STANDING" }], current: 0, isBodyweight: false, hasWeight: true };
    expect(canCreate(skill, ctx)).toBe("Цель по этому навыку уже есть");
    expect(canCreate({ ...skill, stretchSkill: "FOLD_SEATED" }, ctx)).toBeNull();
    const own = { ...skill, stretchSkill: undefined, skillTitle: "Складка у стены" };
    const ctxOwn = { ...ctx, active: [{ type: "STRETCH_SKILL" as const, stretchSkill: null, skillTitle: "складка у стены " }] };
    expect(canCreate(own, ctxOwn)).toBe("Цель по этому навыку уже есть");
    expect(canCreate(own, ctx)).toBeNull();
  });

  test("название, текст значения и прогресс «ниже — лучше»", () => {
    const g = { type: "STRETCH_SKILL" as const, metric: null, target: 0, startValue: 10, stretchSkill: "FOLD_STANDING" };
    expect(goalTitle(g)).toBe("Ладони в пол в наклоне");
    expect(goalTitle({ ...g, stretchSkill: null, skillTitle: "Складка у стены" })).toBe("Складка у стены");
    expect(goalValueText(g, 6, 0)).toBe("Осталось 6 см");
    expect(goalValueText(g, 2.5, 0)).toBe("Осталось 2,5 см");
    expect(goalProgress(g, 10)).toBe(0);
    expect(goalProgress(g, 4)).toBeCloseTo(0.6);
    expect(isAchieved(g, 0.5)).toBe(false);
    expect(isAchieved(g, 0)).toBe(true);
    expect(goalProgress(g, 0)).toBe(1);
  });

  test("«Поставить снова»: стартовый замер — последний замер прежней цели, иначе её старт", () => {
    expect(againSkillStartCm(10, 4.5)).toBe(4.5);
    expect(againSkillStartCm(10, null)).toBe(10);
    // замер 0 — цель была бы достигнута; не подставляем
    expect(againSkillStartCm(10, 0)).toBe(10);
    expect(againSkillStartCm(0, null)).toBeUndefined();
  });
});

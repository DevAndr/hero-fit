import { describe, expect, it } from "vitest";
import { canPublish, catalogRuleText, catalogSourceLabel, daysPerWeek, PUBLISH_BLOCK_TEXT, startBlock } from "./rules";

describe("catalogRuleText", () => {
  it("процент без разгрузки", () => {
    expect(catalogRuleText({ stepKind: "PERCENT", stepValue: 2.5, deloadEvery: null })).toBe("+2,5 % в неделю");
  });
  it("кг с разгрузкой", () => {
    expect(catalogRuleText({ stepKind: "KG", stepValue: 5, deloadEvery: 4 })).toBe(
      "+5 кг в неделю · разгрузка каждую 4-ю неделю",
    );
  });
});

describe("daysPerWeek", () => {
  it("считает уникальные дни", () => {
    expect(daysPerWeek([{ weekday: 1 }, { weekday: 3 }, { weekday: 3 }])).toBe(2);
  });
});

describe("canPublish", () => {
  const ok = { days: 3, description: "Описание", hiddenAt: null };
  const coach = { isCoach: true, nickname: "ник" };
  it("не тренер", () => expect(canPublish(ok, { ...coach, isCoach: false })).toBe("not-coach"));
  it("нет ника", () => expect(canPublish(ok, { ...coach, nickname: null })).toBe("no-nickname"));
  it("нет дней", () => expect(canPublish({ ...ok, days: 0 }, coach)).toBe("no-days"));
  it("нет описания", () => expect(canPublish({ ...ok, description: null }, coach)).toBe("no-description"));
  it("описание из пробелов", () => expect(canPublish({ ...ok, description: "   " }, coach)).toBe("no-description"));
  it("снята админом", () => expect(canPublish({ ...ok, hiddenAt: new Date() }, coach)).toBe("hidden"));
  it("можно", () => expect(canPublish(ok, coach)).toBeNull());
  it("тексты блоков", () => expect(PUBLISH_BLOCK_TEXT["no-days"]).toBe("Добавьте хотя бы один день"));
});

describe("startBlock", () => {
  it("нет активного", () => expect(startBlock(null)).toBeNull());
  it("назначил тренер", () => expect(startBlock({ coachId: "c", catalogProgramId: null })).toBe("coach"));
  it("каталожное", () => expect(startBlock({ coachId: null, catalogProgramId: "p" })).toBe("replace"));
  it("тренер удалён", () => expect(startBlock({ coachId: null, catalogProgramId: null })).toBe("replace"));
});

describe("catalogSourceLabel", () => {
  it("название программы и неделя в скобках", () => {
    expect(catalogSourceLabel("Сила", "Неделя 3/8")).toBe("программа «Сила» (неделя 3/8)");
    expect(catalogSourceLabel("Сила", "Разгрузка · неделя 4/8")).toBe("программа «Сила» (разгрузка · неделя 4/8)");
  });
});

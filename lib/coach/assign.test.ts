import { describe, expect, it } from "vitest";
import { assignInputSchema, assignManyText, assignmentText, pickClients } from "./assign";

describe("assignmentText", () => {
  it("разовая — «на дату»", () => {
    expect(assignmentText({ templateName: "Ноги — база", date: "2026-10-13", weekdays: [] })).toBe("Ноги — база на 13 окт.");
  });
  it("серии — дни недели по порядку с даты начала", () => {
    expect(assignmentText({ templateName: "Ноги — база", date: "2026-10-13", weekdays: [4, 0, 2] })).toBe("Ноги — база, пн/ср/пт с 13 окт.");
  });
});

describe("assignInputSchema", () => {
  const ok = { templateId: "t1", date: "2026-10-13", time: "19:00", durationMin: 60, repeatWeekdays: [0], endDate: "2026-12-07" };
  it("принимает корректное назначение", () => {
    expect(assignInputSchema.safeParse(ok).success).toBe(true);
    expect(assignInputSchema.safeParse({ ...ok, repeatWeekdays: [], endDate: null }).success).toBe(true);
  });
  it("«до» раньше начала и пустой шаблон — ошибка", () => {
    expect(assignInputSchema.safeParse({ ...ok, endDate: "2026-10-12" }).success).toBe(false);
    expect(assignInputSchema.safeParse({ ...ok, templateId: "" }).success).toBe(false);
  });
});

describe("pickClients", () => {
  it("только активные клиенты, без повторов, в порядке запроса; остальные — пропущены", () => {
    expect(pickClients(["a", "b", "a", "x"], ["b", "a", "c"])).toEqual({ ids: ["a", "b"], skipped: 1 });
    expect(pickClients(["x", "y", "x"], ["a"])).toEqual({ ids: [], skipped: 2 });
  });
});

describe("assignManyText", () => {
  it("сколько назначено и пропущено", () => {
    expect(assignManyText(1, 0)).toBe("Назначено 1 клиенту");
    expect(assignManyText(2, 0)).toBe("Назначено 2 клиентам");
    expect(assignManyText(5, 1)).toBe("Назначено 5 клиентам · 1 пропущен");
    expect(assignManyText(3, 2)).toBe("Назначено 3 клиентам · 2 пропущено");
  });
});

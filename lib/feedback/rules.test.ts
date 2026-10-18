import { describe, expect, it } from "vitest";
import { feedbackAlertText, notificationText, preview, shouldNotify } from "./rules";

describe("shouldNotify", () => {
  it("only on a change into done or rejected", () => {
    expect(shouldNotify("NEW", "DONE")).toBe(true);
    expect(shouldNotify("IN_PROGRESS", "REJECTED")).toBe(true);
    expect(shouldNotify("DONE", "REJECTED")).toBe(true);
    expect(shouldNotify("DONE", "DONE")).toBe(false);
    expect(shouldNotify("IN_PROGRESS", "NEW")).toBe(false);
    expect(shouldNotify("DONE", "IN_PROGRESS")).toBe(false);
  });
});

describe("preview", () => {
  it("first line only", () => {
    expect(preview("Первая строка\nвторая")).toBe("Первая строка");
  });
  it("cuts on a word boundary with an ellipsis", () => {
    const p = preview("Добавьте пожалуйста возможность выгружать тренировки в формате таблицы");
    expect(p.endsWith("…")).toBe(true);
    expect(p.length).toBeLessThanOrEqual(41);
    expect(p).toBe("Добавьте пожалуйста возможность…");
  });
  it("one long word is cut hard", () => {
    expect(preview("а".repeat(60))).toBe(`${"а".repeat(40)}…`);
  });
});

describe("texts", () => {
  it("notification for done and rejected", () => {
    expect(notificationText("DONE", "Добавьте тёмную тему")).toEqual({
      title: "Обратная связь",
      body: "Ваше обращение «Добавьте тёмную тему» — сделано",
      url: "/feedback",
    });
    expect(notificationText("REJECTED", "Добавьте тёмную тему").body).toBe("Ваше обращение «Добавьте тёмную тему» — отклонено");
  });
  it("admin alert has no feedback text", () => {
    expect(feedbackAlertText("IDEA", "https://hero.fit")).toBe("📝 Новое обращение: идея\nhttps://hero.fit/admin/feedback");
  });
});

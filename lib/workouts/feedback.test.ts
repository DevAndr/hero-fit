import { describe, expect, it } from "vitest";
import { coachNotice, feedbackNotice, feedbackSchema, rpeLabel } from "./feedback";

describe("feedbackSchema", () => {
  it("тяжесть — целое 1…10, заметка до 500 символов", () => {
    expect(feedbackSchema.safeParse({ rpe: 0, note: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rpe: 11, note: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rpe: 7.5, note: "" }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rpe: 7, note: "x".repeat(501) }).success).toBe(false);
  });

  it("заметка обрезается, пустая — null", () => {
    expect(feedbackSchema.parse({ rpe: 7, note: "   " })).toEqual({ rpe: 7, note: null });
    expect(feedbackSchema.parse({ rpe: 7, note: " болела спина " })).toEqual({ rpe: 7, note: "болела спина" });
  });
});

describe("rpeLabel", () => {
  it("подписи по уровням", () => {
    expect([1, 2, 3, 6, 7, 8, 9, 10].map(rpeLabel)).toEqual([
      "Очень легко",
      "Очень легко",
      "Легко",
      "Нормально",
      "Тяжело",
      "Тяжело",
      "На пределе",
      "На пределе",
    ]);
  });
});

describe("coachNotice", () => {
  const at = new Date();
  it("первое — при заметке или тяжести 9+", () => {
    expect(coachNotice({ rpe: 8, note: null, prevNote: null, notifiedAt: null })).toBeNull();
    expect(coachNotice({ rpe: 9, note: null, prevNote: null, notifiedAt: null })).toBe("first");
    expect(coachNotice({ rpe: 5, note: "плохо спал", prevNote: null, notifiedAt: null })).toBe("first");
  });

  it("после уведомления — только новая или изменённая заметка", () => {
    expect(coachNotice({ rpe: 9, note: "болела спина", prevNote: null, notifiedAt: at })).toBe("update");
    expect(coachNotice({ rpe: 9, note: "болит колено", prevNote: "болела спина", notifiedAt: at })).toBe("update");
    expect(coachNotice({ rpe: 10, note: "болела спина", prevNote: "болела спина", notifiedAt: at })).toBeNull();
    expect(coachNotice({ rpe: 10, note: null, prevNote: "болела спина", notifiedAt: at })).toBeNull();
  });
});

describe("feedbackNotice", () => {
  it("с заметкой (до 80 символов) и без", () => {
    expect(feedbackNotice("Маша", 9, null)).toBe("Маша: тяжесть 9/10 — На пределе");
    expect(feedbackNotice("Маша", 10, "болела спина")).toBe("Маша: тяжесть 10/10 · болела спина");
    expect(feedbackNotice("Маша", 6, "а".repeat(100))).toBe(`Маша: тяжесть 6/10 · ${"а".repeat(79)}…`);
  });
});

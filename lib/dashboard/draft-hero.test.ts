import { describe, expect, it } from "vitest";
import { draftHeroCopy } from "./draft-hero";

const today = "2026-11-09";

describe("draftHeroCopy", () => {
  it("с упражнениями и временем", () =>
    expect(draftHeroCopy({ name: "Грудь", exercises: 5, hasCompleted: false, slot: { date: today, time: "19:00" } }, today)).toEqual({
      headline: "Твоя тренировка готова",
      detail: "«Грудь» · 5 упражнений · сегодня в 19:00",
      cta: "Начать тренировку",
    }));
  it("без времени", () =>
    expect(draftHeroCopy({ name: "Грудь", exercises: 1, hasCompleted: true, slot: null }, today).detail).toBe("«Грудь» · 1 упражнение"));
  it("завтра и дата", () => {
    expect(draftHeroCopy({ name: "Г", exercises: 2, hasCompleted: false, slot: { date: "2026-11-10", time: "19:00" } }, today).detail).toContain(
      "завтра в 19:00",
    );
    expect(draftHeroCopy({ name: "Г", exercises: 2, hasCompleted: false, slot: { date: "2026-11-14", time: "19:00" } }, today).detail).toContain(
      "14 ноября в 19:00",
    );
  });
  it("пустой у новичка", () =>
    expect(draftHeroCopy({ name: "Г", exercises: 0, hasCompleted: false, slot: null }, today)).toEqual({
      headline: "Собери первую тренировку",
      detail: null,
      cta: "Собрать тренировку",
    }));
  it("пустой у опытного", () =>
    expect(draftHeroCopy({ name: "Г", exercises: 0, hasCompleted: true, slot: null }, today).headline).toBe("Твоя тренировка ждёт упражнений"));
});

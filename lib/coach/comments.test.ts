import { describe, expect, it } from "vitest";
import { commentCaption, commentPreview, commentTextSchema } from "./comments";

describe("commentTextSchema", () => {
  it("обрезает пробелы", () => {
    expect(commentTextSchema.parse(" ок ")).toBe("ок");
  });
  it("пустой и слишком длинный — ошибки", () => {
    expect(commentTextSchema.safeParse("  ").error?.issues[0]?.message).toBe("Введите комментарий");
    expect(commentTextSchema.safeParse("a".repeat(1001)).error?.issues[0]?.message).toBe("Не длиннее 1000 символов");
  });
});

describe("commentPreview", () => {
  it("длинный — 120 символов и многоточие, короткий — как есть", () => {
    expect(commentPreview("a".repeat(130))).toBe(`${"a".repeat(120)}…`);
    expect(commentPreview("Техника лучше")).toBe("Техника лучше");
  });
});

describe("commentCaption", () => {
  it("дата — в поясе клиента, а не сервера", () => {
    const at = new Date("2026-10-09T22:30:00Z"); // 01:30 МСК 10 октября
    expect(commentCaption("Coach_Demo", at, "Europe/Moscow")).toBe("Комментарий тренера · Coach_Demo, 10 октября");
    expect(commentCaption("Coach_Demo", at, "UTC")).toBe("Комментарий тренера · Coach_Demo, 9 октября");
  });
});

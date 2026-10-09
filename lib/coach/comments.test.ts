import { describe, expect, it } from "vitest";
import { commentPreview, commentTextSchema } from "./comments";

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

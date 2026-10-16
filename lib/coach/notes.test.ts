import { describe, expect, it } from "vitest";
import { NOTE_MAX, noteTextSchema } from "./notes";

describe("noteTextSchema", () => {
  it("обрезает пробелы; пустой текст допустим — заметка удаляется", () => {
    expect(noteTextSchema.parse("  колено: без глубоких выпадов \n")).toBe("колено: без глубоких выпадов");
    expect(noteTextSchema.parse("   ")).toBe("");
  });
  it("не длиннее 5000 символов", () => {
    expect(NOTE_MAX).toBe(5000);
    expect(noteTextSchema.safeParse("a".repeat(5001)).error?.issues[0]?.message).toBe("Не длиннее 5000 символов");
    expect(noteTextSchema.safeParse("a".repeat(5000)).success).toBe(true);
  });
});

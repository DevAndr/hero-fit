import { describe, expect, it } from "vitest";
import { adminPatchSchema, feedbackSchema } from "./schema";

const errors = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : r.error!.issues.map((i) => i.message));

describe("feedbackSchema", () => {
  it("body is 10–2000 chars after trim", () => {
    expect(errors(feedbackSchema.safeParse({ kind: "IDEA", body: "а".repeat(9) }))).toContain("Опишите подробнее — от 10 символов");
    const ok = feedbackSchema.safeParse({ kind: "IDEA", body: `  ${"а".repeat(10)}  ` });
    expect(ok.success && ok.data.body).toBe("а".repeat(10));
    expect(errors(feedbackSchema.safeParse({ kind: "IDEA", body: "а".repeat(2001) }))).toContain("Не больше 2000 символов");
  });
  it("unknown kind is refused", () => {
    expect(feedbackSchema.safeParse({ kind: "SPAM", body: "а".repeat(20) }).success).toBe(false);
  });
  it("page is an own path without query; anything else is dropped silently", () => {
    const body = "Нормальный текст обращения";
    const page = (p: unknown) => {
      const r = feedbackSchema.safeParse({ kind: "BUG", body, page: p });
      expect(r.success).toBe(true);
      return r.success ? r.data.page : "fail";
    };
    expect(page("/stats?x=1#y")).toBe("/stats");
    expect(page("//evil.com")).toBeUndefined();
    expect(page("https://x.ru")).toBeUndefined();
    expect(page(42)).toBeUndefined();
    expect(page(`/${"a".repeat(250)}`)).toBeUndefined();
  });
});

describe("adminPatchSchema", () => {
  it("blank note becomes null, long note is refused", () => {
    const r = adminPatchSchema.safeParse({ adminNote: "  " });
    expect(r.success && r.data.adminNote).toBeNull();
    expect(adminPatchSchema.safeParse({ adminNote: "а".repeat(1001) }).success).toBe(false);
    expect(adminPatchSchema.safeParse({ status: "DONE" }).success).toBe(true);
    expect(adminPatchSchema.safeParse({ status: "WAT" }).success).toBe(false);
    expect(adminPatchSchema.safeParse({ status: "DONE", expected: "NEW" }).success).toBe(true);
    expect(adminPatchSchema.safeParse({ expected: "WAT" }).success).toBe(false);
  });
});

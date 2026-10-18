import { describe, expect, it } from "vitest";
import { alertInputSchema } from "./schema";

const base = { kind: "BANNER", tone: "INFO", body: "Техработы в 23:00", dismiss: "FOREVER", startsAt: "2026-10-18T12:00:00.000Z" };

function errors(input: unknown): string[] {
  const r = alertInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("alertInputSchema", () => {
  it("a banner without an end and a button is valid; empty strings become undefined", () => {
    const r = alertInputSchema.safeParse({ ...base, title: " ", ctaLabel: "", ctaHref: "", endsAt: "" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ title: undefined, ctaLabel: undefined, ctaHref: undefined, endsAt: undefined });
  });
  it("popup needs a title", () => {
    expect(errors({ ...base, kind: "POPUP" })).toContain("Заголовок обязателен для попапа");
  });
  it("popup cannot be non-dismissable", () => {
    expect(errors({ ...base, kind: "POPUP", title: "Т", dismiss: "NEVER" })).toContain("Попап нельзя сделать незакрываемым");
  });
  it("banner may be non-dismissable", () => {
    expect(errors({ ...base, dismiss: "NEVER" })).toEqual([]);
  });
  it("end must be after start", () => {
    expect(errors({ ...base, endsAt: base.startsAt })).toContain("Конец показа — позже начала");
  });
  it("button needs both label and link", () => {
    expect(errors({ ...base, ctaLabel: "Подробнее" })).toContain("Укажите и подпись, и ссылку кнопки");
    expect(errors({ ...base, ctaHref: "/whats-new" })).toContain("Укажите и подпись, и ссылку кнопки");
  });
  it("link is a path or https", () => {
    expect(errors({ ...base, ctaLabel: "Тык", ctaHref: "javascript:x" })).toContain("Ссылка — /путь или https://");
  });
  it("body is 1–500 chars", () => {
    expect(errors({ ...base, body: "я".repeat(501) })).not.toEqual([]);
    expect(errors({ ...base, body: "  " })).not.toEqual([]);
  });
  it("bad date is refused", () => {
    expect(errors({ ...base, startsAt: "вчера" })).not.toEqual([]);
  });
});

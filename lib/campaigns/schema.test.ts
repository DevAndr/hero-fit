import { describe, expect, it } from "vitest";
import { campaignSchema } from "./schema";

const base = {
  name: "Вернуть",
  condition: "INACTIVE",
  days: "3",
  title: "Скучаем",
  body: "Зайди потренироваться",
  url: "/dashboard",
  push: "on",
  telegram: "on",
  hour: "12",
};
const parse = (o: Record<string, unknown>) =>
  campaignSchema.safeParse({ ...base, ...o });
const failsAt = (r: ReturnType<typeof parse>, key: string) =>
  !r.success && r.error.issues.some((i) => i.path[0] === key);

describe("campaignSchema", () => {
  it("валидная форма", () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data).toMatchObject({
        days: 3,
        hour: 12,
        push: true,
        telegram: true,
      });
  });
  it("days пусто при INACTIVE — ошибка", () => {
    expect(failsAt(parse({ days: "" }), "days")).toBe(true);
  });
  it("days вне 1…90 — ошибка", () => {
    expect(failsAt(parse({ days: "0" }), "days")).toBe(true);
    expect(failsAt(parse({ days: "91" }), "days")).toBe(true);
  });
  it("STREAK_LOST — days = null", () => {
    const r = parse({ condition: "STREAK_LOST", days: "5" });
    expect(r.success && r.data.days).toBe(null);
  });
  it("нужен хотя бы один канал", () => {
    expect(parse({ push: undefined, telegram: undefined }).success).toBe(false);
    expect(parse({ push: false, telegram: false }).success).toBe(false);
  });
  it("hour 8…21", () => {
    expect(failsAt(parse({ hour: "7" }), "hour")).toBe(true);
    expect(failsAt(parse({ hour: "22" }), "hour")).toBe(true);
    expect(parse({ hour: "21" }).success).toBe(true);
  });
  it("url только /путь", () => {
    expect(failsAt(parse({ url: "https://x.ru" }), "url")).toBe(true);
    expect(failsAt(parse({ url: "/\t/evil.com" }), "url")).toBe(true);
    expect(parse({ url: "/dashboard" }).success).toBe(true);
  });
  it("лимиты длины", () => {
    expect(failsAt(parse({ title: "а".repeat(61) }), "title")).toBe(true);
    expect(failsAt(parse({ body: "а".repeat(301) }), "body")).toBe(true);
    expect(failsAt(parse({ name: "а".repeat(81) }), "name")).toBe(true);
  });
});

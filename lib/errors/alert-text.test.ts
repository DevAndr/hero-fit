import { describe, expect, it } from "vitest";
import { alertText } from "./alert";

describe("alertText", () => {
  it("no error text or path in Telegram — only kind, source, version and the admin link", () => {
    // Группа целиком (с текстом и путём) — в оповещение они попасть не должны
    const group = { id: "g1", source: "CLIENT" as const, message: "user ivan@example.com failed", path: "/clubs/join/SECRETCODE", version: "0.7.0" };
    const text = alertText(group, "new", "https://hero-fit.ru");
    expect(text).toBe("🔴 Новая ошибка\nбраузер · v0.7.0\nhttps://hero-fit.ru/admin/errors/g1");
    expect(text).not.toContain("ivan@");
    expect(text).not.toContain("SECRETCODE");
    expect(alertText({ id: "g2", source: "SERVER", version: null }, "back", "https://h")).toBe(
      "🔁 Ошибка вернулась\nсервер\nhttps://h/admin/errors/g2",
    );
  });
});

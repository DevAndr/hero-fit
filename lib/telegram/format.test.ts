import { describe, expect, it } from "vitest";
import { escapeHtml, linkTokenStatus, newLinkToken, publicHttps, telegramEnabled, telegramMessage, webhookStatus } from "./format";

describe("telegramMessage", () => {
  it("заголовок жирным, текст экранирован, кнопка на абсолютный url", () => {
    const m = telegramMessage({ title: "Новый план", body: "От <Coach> & Co", url: "/calendar" }, "https://hero-fit.ru");
    expect(m.text).toBe("<b>Новый план</b>\nОт &lt;Coach&gt; &amp; Co");
    expect(m.parse_mode).toBe("HTML");
    expect(m.reply_markup?.inline_keyboard).toEqual([[{ text: "Открыть", url: "https://hero-fit.ru/calendar" }]]);
  });
  it("без url — кнопка на дашборд", () => {
    const m = telegramMessage({ title: "T", body: "B", url: null }, "https://hero-fit.ru");
    expect(m.reply_markup?.inline_keyboard[0][0].url).toBe("https://hero-fit.ru/dashboard");
  });
  it("непубличный адрес — без кнопки", () => {
    expect(telegramMessage({ title: "T", body: "B", url: "/x" }, "http://localhost:3123").reply_markup).toBeUndefined();
    expect(publicHttps("https://localhost")).toBe(false);
    expect(publicHttps("https://127.0.0.1:3000")).toBe(false);
    expect(publicHttps("https://hero-fit.ru")).toBe(true);
  });
  it("escapeHtml экранирует заголовок тоже", () => {
    expect(escapeHtml("<b>&")).toBe("&lt;b&gt;&amp;");
    expect(telegramMessage({ title: "<i>", body: "", url: null }, "http://localhost").text).toBe("<b>&lt;i&gt;</b>\n");
  });
});

describe("linkTokenStatus", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("нет токена", () => expect(linkTokenStatus(null, now)).toBe("missing"));
  it("использован важнее истёк", () =>
    expect(linkTokenStatus({ expiresAt: new Date("2026-10-10T11:00:00Z"), usedAt: new Date("2026-10-10T10:59:00Z") }, now)).toBe("used"));
  it("истёк", () => expect(linkTokenStatus({ expiresAt: now, usedAt: null }, now)).toBe("expired"));
  it("годен", () => expect(linkTokenStatus({ expiresAt: new Date("2026-10-10T12:10:00Z"), usedAt: null }, now)).toBe("ok"));
});

describe("newLinkToken", () => {
  it("32 символа base64url, каждый раз новый", () => {
    const a = newLinkToken();
    expect(a).toHaveLength(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(newLinkToken()).not.toBe(a);
  });
});

describe("telegramEnabled / webhookStatus", () => {
  const on = { TELEGRAM_BOT_TOKEN: "t", TELEGRAM_BOT_USERNAME: "bot", TELEGRAM_WEBHOOK_SECRET: "s" };
  it("включение по токену и имени", () => {
    expect(telegramEnabled({})).toBe(false);
    expect(telegramEnabled({ TELEGRAM_BOT_TOKEN: "t" })).toBe(false);
    expect(telegramEnabled(on)).toBe(true);
  });
  it("404 выключено, 401 неверный секрет, 200 верный", () => {
    expect(webhookStatus({}, "x")).toBe(404);
    expect(webhookStatus(on, "s")).toBe(200);
    expect(webhookStatus(on, null)).toBe(401);
    expect(webhookStatus(on, "t")).toBe(401);
  });
});

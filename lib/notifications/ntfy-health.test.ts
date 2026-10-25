import { describe, expect, it } from "vitest";
import { createNtfyHealth, NTFY_ALERT_EVERY_MS, ntfyOutcome } from "./ntfy-health";

describe("createNtfyHealth", () => {
  it("алерт на 5-м сбое подряд, не раньше", () => {
    const h = createNtfyHealth();
    expect([1, 2, 3, 4].map((i) => h.record(false, i))).toEqual([false, false, false, false]);
    expect(h.record(false, 5)).toBe(true);
  });

  it("успех обнуляет серию", () => {
    const h = createNtfyHealth();
    for (let i = 0; i < 4; i++) h.record(false, i);
    h.record(true, 4);
    for (let i = 5; i < 9; i++) expect(h.record(false, i)).toBe(false);
  });

  it("повторный алерт — не раньше чем через час", () => {
    const h = createNtfyHealth();
    for (let i = 0; i < 5; i++) h.record(false, i);
    expect(h.record(false, 10)).toBe(false);
    expect(h.record(false, 4 + NTFY_ALERT_EVERY_MS)).toBe(true);
  });
});

describe("ntfyOutcome", () => {
  const host = "push.example.ru";
  it("наш хост: успех и сбой", () => {
    expect(ntfyOutcome("https://push.example.ru/upA", host, "ok")).toBe(true);
    expect(ntfyOutcome("https://PUSH.example.ru:443/upA", host, 502)).toBe(false);
    expect(ntfyOutcome("https://push.example.ru/upA", host, undefined)).toBe(false);
  });
  it("404/410 — подписка умерла, это не сбой ntfy", () => {
    expect(ntfyOutcome("https://push.example.ru/upA", host, 404)).toBeNull();
    expect(ntfyOutcome("https://push.example.ru/upA", host, 410)).toBeNull();
  });
  it("чужой хост и ntfy не настроен — не считаем", () => {
    expect(ntfyOutcome("https://fcm.googleapis.com/x", host, 500)).toBeNull();
    expect(ntfyOutcome("https://push.example.ru/upA", null, 500)).toBeNull();
  });
});

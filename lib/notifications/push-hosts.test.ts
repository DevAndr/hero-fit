import { describe, expect, it } from "vitest";
import { allowedPushHost, subscriptionAllowed, subscriptionSchema } from "./push-hosts";

const NTFY = "https://push.example.ru";

describe("allowedPushHost", () => {
  it("WEB: любой https-хост браузерного сервиса", () => {
    expect(allowedPushHost("WEB", "https://fcm.googleapis.com/fcm/send/abc", NTFY)).toBe(true);
    expect(allowedPushHost("WEB", "https://push.yandex.ru/x", undefined)).toBe(true);
  });

  it("WEB: не http, не localhost, не IP", () => {
    expect(allowedPushHost("WEB", "http://fcm.googleapis.com/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://localhost/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://app.localhost/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://127.0.0.1:8443/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://[::1]/x", NTFY)).toBe(false);
    expect(allowedPushHost("WEB", "https://10.0.0.5/x", NTFY)).toBe(false);
  });

  it("нативные: только имя хоста NTFY_URL, порт не важен", () => {
    for (const kind of ["UNIFIEDPUSH", "EMBEDDED"] as const) {
      expect(allowedPushHost(kind, "https://push.example.ru/upAbc?up=1", NTFY)).toBe(true);
      expect(allowedPushHost(kind, "https://PUSH.example.ru:8443/upAbc", NTFY)).toBe(true);
      expect(allowedPushHost(kind, "https://ntfy.sh/upAbc?up=1", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://push.example.ru.evil.com/up", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://evil.com/?h=push.example.ru", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "http://push.example.ru/up", NTFY)).toBe(false);
      expect(allowedPushHost(kind, "https://push.example.ru/up", undefined)).toBe(false);
    }
  });

  it("нативные: e2e-ntfy на 127.0.0.1 со случайным портом", () => {
    expect(allowedPushHost("UNIFIEDPUSH", "https://127.0.0.1:51234/push/ab", "https://127.0.0.1")).toBe(true);
  });

  it("мусор вместо URL — false", () => {
    expect(allowedPushHost("WEB", "not a url", NTFY)).toBe(false);
    expect(allowedPushHost("UNIFIEDPUSH", "https://push.example.ru/up", "not a url")).toBe(false);
  });
});

describe("subscriptionSchema", () => {
  const base = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } };

  it("без kind — WEB (старые клиенты)", () => {
    expect(subscriptionSchema.parse(base).kind).toBe("WEB");
  });

  it("kind и appVersion принимаются", () => {
    expect(subscriptionSchema.parse({ ...base, kind: "EMBEDDED", appVersion: "1.0.0" })).toMatchObject({ kind: "EMBEDDED", appVersion: "1.0.0" });
  });

  it("чужой kind и длинная версия — ошибка", () => {
    expect(subscriptionSchema.safeParse({ ...base, kind: "FCM" }).success).toBe(false);
    expect(subscriptionSchema.safeParse({ ...base, appVersion: "x".repeat(33) }).success).toBe(false);
  });
});

describe("subscriptionAllowed", () => {
  const native = "https://push.example.ru/upAbcdefghijkl?up=1";
  it("нативная подписка — только при включённом native_app", () => {
    expect(subscriptionAllowed("UNIFIEDPUSH", native, NTFY, false)).toBe(false);
    expect(subscriptionAllowed("EMBEDDED", native, NTFY, false)).toBe(false);
    expect(subscriptionAllowed("UNIFIEDPUSH", native, NTFY, true)).toBe(true);
  });
  it("веб от флага не зависит, хост проверяется всегда", () => {
    expect(subscriptionAllowed("WEB", "https://fcm.googleapis.com/x", NTFY, false)).toBe(true);
    expect(subscriptionAllowed("UNIFIEDPUSH", "https://ntfy.sh/upAbcdefghijkl", NTFY, true)).toBe(false);
  });
});

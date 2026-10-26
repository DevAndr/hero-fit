import { afterEach, describe, expect, it, vi } from "vitest";
import { readNotificationPermission, subscribeErrorText } from "./subscribe-error";

afterEach(() => vi.unstubAllGlobals());

describe("readNotificationPermission", () => {
  it("без Notification API (WebView Android-приложения) — unsupported, без ReferenceError", () => {
    expect(typeof globalThis.Notification).toBe("undefined");
    expect(readNotificationPermission()).toBe("unsupported");
  });

  it("с API — разрешение браузера", () => {
    vi.stubGlobal("Notification", { permission: "denied" });
    expect(readNotificationPermission()).toBe("denied");
  });
});

describe("subscribeErrorText", () => {
  it("браузер: запрещено — где включить, иначе — про инкогнито", () => {
    expect(subscribeErrorText({ native: false, nativeReason: null, permission: "denied" })).toBe(
      "Разрешение на уведомления не выдано — включите его в настройках сайта",
    );
    expect(subscribeErrorText({ native: false, nativeReason: null, permission: "unsupported" })).toBe(
      "Не удалось включить push. В режиме инкогнито браузеры его не поддерживают.",
    );
  });

  it("приложение: причина из ntfy, без браузерных советов", () => {
    expect(subscribeErrorText({ native: true, nativeReason: "no-distributor", permission: "unsupported" })).toBe(
      "Установите приложение ntfy — подробности в настройках уведомлений",
    );
    expect(subscribeErrorText({ native: true, nativeReason: "foreign-server", permission: "unsupported" })).toBe(
      "В ntfy выбран чужой сервер — подробности в настройках уведомлений",
    );
    expect(subscribeErrorText({ native: true, nativeReason: "permission", permission: "unsupported" })).toBe(
      "Разрешите уведомления для Hero Fit в настройках Android",
    );
    expect(subscribeErrorText({ native: true, nativeReason: "server-off", permission: "unsupported" })).toBe(
      "Уведомления в приложении пока недоступны",
    );
    expect(subscribeErrorText({ native: true, nativeReason: null, permission: "unsupported" })).toBe("Не удалось включить push");
  });
});

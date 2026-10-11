import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic, tg, tgSupports, type WebApp } from "./webapp";

function install(app: Partial<WebApp> | undefined) {
  vi.stubGlobal("window", app === undefined ? {} : { Telegram: { WebApp: app } });
}

afterEach(() => vi.unstubAllGlobals());

describe("tg", () => {
  it("без SDK или без initData — null", () => {
    install(undefined);
    expect(tg()).toBeNull();
    install({ initData: "" });
    expect(tg()).toBeNull();
  });

  it("с initData — объект SDK", () => {
    install({ initData: "x" });
    expect(tg()).not.toBeNull();
  });
});

describe("tgSupports", () => {
  it("без isVersionAtLeast — false", () => {
    expect(tgSupports({ initData: "x" } as WebApp, "7.7")).toBe(false);
  });

  it("бросает — false", () => {
    const app = { isVersionAtLeast: () => { throw new Error("old"); } } as unknown as WebApp;
    expect(tgSupports(app, "7.7")).toBe(false);
  });

  it("ответ SDK", () => {
    const app = { isVersionAtLeast: (v: string) => v === "7.7" } as unknown as WebApp;
    expect(tgSupports(app, "7.7")).toBe(true);
    expect(tgSupports(app, "8.0")).toBe(false);
  });
});

describe("haptic", () => {
  it("light — impact, остальное — notification", () => {
    const HapticFeedback = { impactOccurred: vi.fn(), notificationOccurred: vi.fn() };
    install({ initData: "x", HapticFeedback });
    haptic("light");
    haptic("success");
    haptic("warning");
    expect(HapticFeedback.impactOccurred).toHaveBeenCalledWith("light");
    expect(HapticFeedback.notificationOccurred).toHaveBeenNthCalledWith(1, "success");
    expect(HapticFeedback.notificationOccurred).toHaveBeenNthCalledWith(2, "warning");
  });

  it("без SDK и при ошибке SDK — не бросает", () => {
    install(undefined);
    expect(() => haptic("success")).not.toThrow();
    install({ initData: "x", HapticFeedback: { impactOccurred: () => { throw new Error(); }, notificationOccurred: vi.fn() } });
    expect(() => haptic("light")).not.toThrow();
  });
});

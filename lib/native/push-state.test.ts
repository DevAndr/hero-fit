import { describe, expect, it } from "vitest";
import { nativePushReason } from "./push-state";

const ok = { distributor: true, permission: "granted" as const, endpoint: "https://push.hero-fit.ru/upAbcdefghijkl", ntfyHost: "push.hero-fit.ru" };

describe("nativePushReason", () => {
  it("всё в порядке — null", () => {
    expect(nativePushReason(ok)).toBeNull();
  });

  it("на сервере нет ntfy — server-off, даже без дистрибьютора", () => {
    expect(nativePushReason({ ...ok, ntfyHost: null })).toBe("server-off");
    expect(nativePushReason({ ...ok, ntfyHost: null, distributor: false })).toBe("server-off");
  });

  it("нет приложения ntfy — no-distributor", () => {
    expect(nativePushReason({ ...ok, distributor: false, endpoint: null })).toBe("no-distributor");
  });

  it("уведомления запрещены — permission", () => {
    expect(nativePushReason({ ...ok, permission: "denied" })).toBe("permission");
  });

  it("эндпоинт на чужом сервере — foreign-server", () => {
    expect(nativePushReason({ ...ok, endpoint: "https://ntfy.sh/upAbcdefghijkl" })).toBe("foreign-server");
  });

  it("регистр и порт хоста не важны", () => {
    expect(nativePushReason({ ...ok, endpoint: "https://PUSH.hero-fit.ru:443/upAbcdefghijkl" })).toBeNull();
  });

  it("эндпоинта ещё нет, разрешение не спрашивали — null", () => {
    expect(nativePushReason({ ...ok, endpoint: null, permission: "prompt" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { bucket, enabledKeys, flagOn, type FlagState } from "./eval";
import { FLAGS } from "./registry";

const on = (percent: number, userIds: string[] = []): FlagState => ({ enabled: true, percent, userIds });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `user-${i}`);

describe("flagOn", () => {
  it("нет строки — выключен", () => {
    expect(flagOn("x", null, "u")).toBe(false);
  });

  it("kill switch сильнее списка и процента", () => {
    expect(flagOn("x", { enabled: false, percent: 100, userIds: ["u"] }, "u")).toBe(false);
  });

  it("список пользователей при 0 %", () => {
    expect(flagOn("x", on(0, ["u"]), "u")).toBe(true);
    expect(flagOn("x", on(0, ["u"]), "v")).toBe(false);
  });

  it("100 % — всем; гость — только при 100 %", () => {
    expect(ids(20).every((id) => flagOn("x", on(100), id))).toBe(true);
    expect(flagOn("x", on(100), null)).toBe(true);
    expect(flagOn("x", on(99), null)).toBe(false);
  });
});

describe("bucket", () => {
  it("0…99 и стабилен", () => {
    for (const id of ids(50)) {
      const b = bucket("x", id);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
      expect(bucket("x", id)).toBe(b);
    }
  });

  it("равномерен: при 25 % — около четверти", () => {
    const share = ids(1000).filter((id) => flagOn("x", on(25), id)).length / 1000;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.3);
  });

  it("рост процента не выключает уже включённых", () => {
    const at10 = ids(200).filter((id) => flagOn("x", on(10), id));
    expect(at10.every((id) => flagOn("x", on(25), id))).toBe(true);
  });

  it("у разных флагов — разные группы", () => {
    expect(ids(50).some((id) => bucket("a", id) !== bucket("b", id))).toBe(true);
  });
});

describe("enabledKeys", () => {
  it("только флаги реестра", () => {
    const states = new Map([
      ["strength_analytics", on(100)],
      ["old_flag", on(100)],
    ]);
    expect(enabledKeys(states, "u")).toEqual(["strength_analytics"]);
  });
});

describe("реестр", () => {
  it("срок жизни — дата и ещё не прошёл (иначе удали флаг и проверки из кода)", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [key, f] of Object.entries(FLAGS)) {
      expect(f.expires, key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(f.expires >= today, `${key}: срок ${f.expires} прошёл`).toBe(true);
    }
  });
});

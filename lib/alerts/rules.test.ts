import { describe, expect, it } from "vitest";
import { alertOrder, isLive, nextChange, nextPopup, safeHref, visibleBanners, type AlertView } from "./rules";

const NOW = new Date("2026-10-18T12:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

function alert(p: Partial<AlertView> & { id: string }): AlertView {
  return {
    kind: "BANNER",
    tone: "INFO",
    title: null,
    body: "текст",
    ctaLabel: null,
    ctaHref: null,
    dismiss: "FOREVER",
    startsAt: at(-60),
    endsAt: null,
    ...p,
  };
}

describe("isLive", () => {
  it("starts inclusively and ends exclusively", () => {
    expect(isLive({ startsAt: at(0), endsAt: null }, NOW)).toBe(true);
    expect(isLive({ startsAt: at(-10), endsAt: at(0) }, NOW)).toBe(false);
  });
  it("without an end lives on; future start is not live", () => {
    expect(isLive({ startsAt: at(-10), endsAt: null }, NOW)).toBe(true);
    expect(isLive({ startsAt: at(1), endsAt: null }, NOW)).toBe(false);
  });
});

describe("alertOrder", () => {
  it("critical first, then warning, then info; newer first within a tone", () => {
    const list = [
      alert({ id: "info-new", tone: "INFO", startsAt: at(-1) }),
      alert({ id: "crit-old", tone: "CRITICAL", startsAt: at(-100) }),
      alert({ id: "warn", tone: "WARNING" }),
      alert({ id: "info-old", tone: "INFO", startsAt: at(-50) }),
    ];
    expect([...list].sort(alertOrder).map((a) => a.id)).toEqual(["crit-old", "warn", "info-new", "info-old"]);
  });
});

describe("visibleBanners", () => {
  it("at most 3 live banners, hidden and popups excluded", () => {
    const list = [
      ...[1, 2, 3, 4, 5].map((n) => alert({ id: `b${n}`, startsAt: at(-n) })),
      alert({ id: "p", kind: "POPUP", title: "t" }),
    ];
    expect(visibleBanners(list, NOW, new Set()).map((a) => a.id)).toEqual(["b1", "b2", "b3"]);
    expect(visibleBanners(list, NOW, new Set(["b1"])).map((a) => a.id)).toEqual(["b2", "b3", "b4"]);
  });
  it("future banner is not visible", () => {
    expect(visibleBanners([alert({ id: "f", startsAt: at(5) })], NOW, new Set())).toEqual([]);
  });
});

describe("nextPopup", () => {
  it("skips hidden and returns the next live popup", () => {
    const list = [
      alert({ id: "p1", kind: "POPUP", tone: "CRITICAL" }),
      alert({ id: "p2", kind: "POPUP" }),
      alert({ id: "b", kind: "BANNER" }),
    ];
    expect(nextPopup(list, NOW, new Set())?.id).toBe("p1");
    expect(nextPopup(list, NOW, new Set(["p1"]))?.id).toBe("p2");
    expect(nextPopup(list, NOW, new Set(["p1", "p2"]))).toBeNull();
  });
});

describe("nextChange", () => {
  it("nearest future start or end", () => {
    const list = [alert({ id: "a", startsAt: at(10) }), alert({ id: "b", startsAt: at(-10), endsAt: at(5) })];
    expect(nextChange(list, NOW)?.toISOString()).toBe(at(5));
  });
  it("only past moments — null", () => {
    expect(nextChange([alert({ id: "a", startsAt: at(-10), endsAt: at(-1) })], NOW)).toBeNull();
    expect(nextChange([alert({ id: "a", startsAt: at(-10) })], NOW)).toBeNull();
  });
});

describe("safeHref", () => {
  it("internal paths and https only", () => {
    expect(safeHref("/whats-new")).toBe(true);
    expect(safeHref("https://t.me/x")).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.com", "http://x.ru", "whats-new", "", "/\\evil.com", "https://", "/\t/evil.com", "/\n/evil.com", "/ok\u0000", "https://ok.ru/\tx"]) {
      expect(safeHref(bad), bad).toBe(false);
    }
  });
});

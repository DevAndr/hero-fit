import { describe, expect, it } from "vitest";
import { navigationTarget } from "./progress";

const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const link = (href: string, extra: { target?: string; download?: boolean } = {}) => ({ href, target: "", download: false, ...extra });
const here = new URL("https://hero.fit/stats?range=30");

describe("navigationTarget", () => {
  it("internal link → path with query", () => {
    expect(navigationTarget(link("/dashboard"), click, here)).toBe("/dashboard");
    expect(navigationTarget(link("https://hero.fit/workouts/1?tab=sets#top"), click, here)).toBe("/workouts/1?tab=sets");
    expect(navigationTarget(link("/stats?range=7"), click, here)).toBe("/stats?range=7");
  });

  it("same page or an anchor on it is not a navigation", () => {
    expect(navigationTarget(link("/stats?range=30"), click, here)).toBeNull();
    expect(navigationTarget(link("#data"), click, here)).toBeNull();
  });

  it("new tab, other button, download and other sites are skipped", () => {
    expect(navigationTarget(link("/dashboard"), { ...click, ctrlKey: true }, here)).toBeNull();
    expect(navigationTarget(link("/dashboard"), { ...click, metaKey: true }, here)).toBeNull();
    expect(navigationTarget(link("/dashboard"), { ...click, button: 1 }, here)).toBeNull();
    expect(navigationTarget(link("/dashboard", { target: "_blank" }), click, here)).toBeNull();
    expect(navigationTarget(link("/account/export/json", { download: true }), click, here)).toBeNull();
    expect(navigationTarget(link("https://t.me/herofit_bot"), click, here)).toBeNull();
    expect(navigationTarget(link("mailto:hi@hero.fit"), click, here)).toBeNull();
  });

  it("explicit _self target still navigates", () => {
    expect(navigationTarget(link("/goals", { target: "_self" }), click, here)).toBe("/goals");
  });
});

import { describe, expect, it } from "vitest";
import { isFlagKey } from "@/lib/flags/registry";
import pkg from "@/package.json";
import { RELEASES } from "./releases";
import type { ChangeItem, Release } from "./types";
import { buildLabel, compareVersions, SEMVER } from "./version";
import { hasUnseen, isPublicHref, isRecent, latestReleaseId, userChangelog, visibleRelease } from "./view";

const rel = (id: string, date: string, items: ChangeItem[], improved?: ChangeItem[]): Release => ({
  id,
  version: "0.1.0",
  date,
  title: `Релиз ${id}`,
  summary: "Коротко",
  new: items,
  improved,
});
const all = { enabled: () => true, publicOnly: false };
const off = { enabled: () => false, publicOnly: false };

describe("visibleRelease", () => {
  it("пункт под выключенным флагом скрыт, пустой раздел — тоже", () => {
    const r = rel("a", "2026-10-12", [{ text: "Обычное" }], [{ text: "Скрытое", flag: "strength_analytics" }]);
    const v = visibleRelease(r, off)!;
    expect(v.new.map((i) => i.text)).toEqual(["Обычное"]);
    expect(v.improved).toBeUndefined();
    expect(visibleRelease(r, all)!.improved).toHaveLength(1);
  });

  it("все пункты под выключенным флагом — релиза нет", () => {
    expect(visibleRelease(rel("a", "2026-10-12", [{ text: "Скрытое", flag: "strength_analytics" }]), off)).toBeNull();
  });

  it("публично — ссылки только на публичные страницы", () => {
    const r = rel("a", "2026-10-12", [
      { text: "Цели", href: "/goals" },
      { text: "Гильдии", href: "/#guilds" },
      { text: "Калькулятор", href: "/tools/1rm" },
    ]);
    const v = visibleRelease(r, { enabled: () => true, publicOnly: true })!;
    expect(v.new.map((i) => i.href)).toEqual([undefined, "/#guilds", "/tools/1rm"]);
    expect(visibleRelease(r, all)!.new[0].href).toBe("/goals");
  });
});

describe("isPublicHref", () => {
  it("главная, якоря, инструменты и сама страница", () => {
    expect(["/", "/#faq", "/tools/plates", "/changelog"].every(isPublicHref)).toBe(true);
    expect(["/goals", "/guild", "/dashboard"].some(isPublicHref)).toBe(false);
  });
});

describe("hasUnseen / latestReleaseId", () => {
  const list = [rel("b", "2026-11-01", [{ text: "x" }]), rel("a", "2026-10-01", [{ text: "y" }])];
  it("новое есть, пока не просмотрен последний", () => {
    expect(hasUnseen(list, null)).toBe(true);
    expect(hasUnseen(list, "b")).toBe(false);
    expect(hasUnseen(list, "a")).toBe(true);
    expect(hasUnseen(list, "zzz")).toBe(true);
    expect(hasUnseen([], null)).toBe(false);
  });
  it("последний — первый в списке", () => {
    expect(latestReleaseId(list)).toBe("b");
    expect(latestReleaseId([])).toBeNull();
  });
});

describe("isRecent", () => {
  it("60 дней включительно", () => {
    const r = rel("a", "2026-10-01", [{ text: "x" }]);
    expect(isRecent(r, "2026-11-30")).toBe(true);
    expect(isRecent(r, "2026-12-01")).toBe(false);
  });
});

describe("RELEASES", () => {
  it("корректные данные", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(new Set(RELEASES.map((r) => r.id)).size).toBe(RELEASES.length);
    for (const [i, r] of RELEASES.entries()) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (i > 0) expect(r.date <= RELEASES[i - 1].date).toBe(true);
      const items = [...r.new, ...(r.improved ?? []), ...(r.fixed ?? [])];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        if (item.flag) expect(isFlagKey(item.flag)).toBe(true);
        expect(item.text).not.toMatch(/флаг|админ/i);
      }
    }
  });

  it("версии растут, у последнего релиза — версия из package.json", () => {
    for (const [i, r] of RELEASES.entries()) {
      expect(r.version).toMatch(SEMVER);
      if (i > 0) expect(compareVersions(r.version, RELEASES[i - 1].version)).toBeLessThan(0);
    }
    // Упало — при сборке релиза не подняли версию: npm version minor --no-git-tag-version (hotfix — patch)
    expect(RELEASES[0].version).toBe(pkg.version);
  });
});

describe("compareVersions", () => {
  it("сравнивает числа, а не строки", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "0.99.9")).toBeGreaterThan(0);
    expect(compareVersions("0.4.1", "0.4.0")).toBeGreaterThan(0);
    expect(compareVersions("0.4.0", "0.4.0")).toBe(0);
    expect(compareVersions("0.3.0", "0.4.0")).toBeLessThan(0);
  });
});

describe("buildLabel", () => {
  it("sha из CI — через точку, локальная сборка — только версия", () => {
    expect(buildLabel("0.4.0", "a1b2c3d")).toBe("v0.4.0 · a1b2c3d");
    expect(buildLabel("0.4.0", "dev")).toBe("v0.4.0");
    expect(buildLabel("0.4.0", undefined)).toBe("v0.4.0");
  });
});

describe("userChangelog", () => {
  const hidden = rel("b", "2026-11-01", [{ text: "Скрытое", flag: "strength_analytics" }]);
  const shown = rel("a", "2026-10-01", [{ text: "Обычное" }]);

  it("релиз, целиком скрытый флагом, не зажигает точку и не становится «последним»", () => {
    const u = userChangelog([hidden, shown], "a", () => false);
    expect(u).toMatchObject({ unseen: false, latest: "a" });
    expect(u.releases.map((r) => r.id)).toEqual(["a"]);
  });

  it("просмотренным записан скрытый релиз (новичку — самый свежий): точки нет", () => {
    expect(userChangelog([hidden, shown], "b", () => false)).toMatchObject({ unseen: false, latest: "a" });
  });

  it("флаг включили — релиз появился и точка загорелась", () => {
    expect(userChangelog([hidden, shown], "a", () => true)).toMatchObject({ unseen: true, latest: "b" });
  });
});

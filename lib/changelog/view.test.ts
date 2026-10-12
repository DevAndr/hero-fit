import { describe, expect, it } from "vitest";
import { isFlagKey } from "@/lib/flags/registry";
import { RELEASES } from "./releases";
import type { ChangeItem, Release } from "./types";
import { hasUnseen, isPublicHref, isRecent, latestReleaseId, visibleRelease } from "./view";

const rel = (id: string, date: string, items: ChangeItem[], improved?: ChangeItem[]): Release => ({
  id,
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
});

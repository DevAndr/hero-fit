import { describe, expect, it } from "vitest";
import {
  aboutPreview,
  ABOUT_PREVIEW,
  catalogFilterSchema,
  catalogMissing,
  cityOptions,
  inCatalog,
  matchesFormat,
  sortCatalog,
  type CatalogProfile,
} from "./catalog";

const none = { telegram: null, whatsapp: null, vk: null, phone: null, email: null };
const full: CatalogProfile = {
  ...none,
  telegram: "hero_coach",
  publishedAt: new Date("2026-10-01"),
  contactsConsentAt: new Date("2026-10-01"),
  catalogListed: true,
  city: "Казань",
  format: "BOTH",
};

describe("inCatalog", () => {
  it("полный профиль — в каталоге", () => expect(inCatalog(full, true)).toBe(true));

  it("любого условия не хватает — нет", () => {
    expect(inCatalog({ ...full, catalogListed: false }, true)).toBe(false);
    expect(inCatalog({ ...full, publishedAt: null }, true)).toBe(false);
    expect(inCatalog(full, false)).toBe(false);
    expect(inCatalog({ ...full, telegram: null }, true)).toBe(false);
    expect(inCatalog({ ...full, contactsConsentAt: null }, true)).toBe(false);
    expect(inCatalog({ ...full, city: null, format: "OFFLINE" }, true)).toBe(false);
    expect(inCatalog({ ...full, city: null, format: "BOTH" }, true)).toBe(false);
  });

  it("онлайн — можно без города", () => expect(inCatalog({ ...full, city: null, format: "ONLINE" }, true)).toBe(true));
});

describe("catalogMissing", () => {
  it("перечисляет по порядку, что мешает", () => {
    expect(catalogMissing(full, true)).toEqual([]);
    expect(catalogMissing({ ...full, catalogListed: false, contactsConsentAt: null }, true)).toEqual([
      "включите показ в каталоге",
      "отметьте согласие на показ контактов",
    ]);
    expect(catalogMissing({ ...full, ...none, publishedAt: null, city: null }, true)).toEqual([
      "опубликуйте страницу",
      "укажите хотя бы один контакт",
      "укажите город",
    ]);
    expect(catalogMissing({ ...full, city: null, format: "ONLINE" }, true)).toEqual([]);
    expect(catalogMissing(full, false)).toEqual(["включите режим тренера"]);
  });
});

describe("matchesFormat", () => {
  it("«онлайн и в зале» подходит под оба", () => {
    expect(matchesFormat("BOTH", "ONLINE")).toBe(true);
    expect(matchesFormat("BOTH", "OFFLINE")).toBe(true);
    expect(matchesFormat("ONLINE", "OFFLINE")).toBe(false);
    expect(matchesFormat("OFFLINE", "OFFLINE")).toBe(true);
    expect(matchesFormat("ONLINE", null)).toBe(true);
  });
});

describe("cityOptions", () => {
  it("одно написание на город, по алфавиту", () => {
    expect(cityOptions([" Москва", "москва", "МОСКВА", "Казань", "Орёл", "орел"])).toEqual([
      { key: "казань", label: "Казань" },
      { key: "москва", label: "Москва" },
      { key: "орел", label: "Орёл" },
    ]);
  });
});

describe("catalogFilterSchema", () => {
  it("неизвестное — сбрасывается", () => {
    expect(catalogFilterSchema.parse({ format: "x", specialty: "nope", page: "-3" })).toEqual({ city: null, format: null, specialty: null, page: 1 });
    expect(catalogFilterSchema.parse({})).toEqual({ city: null, format: null, specialty: null, page: 1 });
  });
  it("известное — принимается, город — ключом", () => {
    expect(catalogFilterSchema.parse({ city: " МОСКВА ", format: "ONLINE", specialty: "strength", page: "2" })).toEqual({
      city: "москва",
      format: "ONLINE",
      specialty: "strength",
      page: 2,
    });
  });
});

describe("sortCatalog", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ userId: `user-${i}`, active: i % 3 === 0 }));

  it("активные выше", () => {
    const sorted = sortCatalog(items, "2026-10-25");
    const firstInactive = sorted.findIndex((x) => !x.active);
    expect(sorted.slice(firstInactive).every((x) => !x.active)).toBe(true);
  });

  it("порядок стабилен в пределах дня и меняется в другой день", () => {
    const ids = (day: string) => sortCatalog(items, day).map((x) => x.userId);
    expect(ids("2026-10-25")).toEqual(ids("2026-10-25"));
    expect(ids("2026-10-26")).not.toEqual(ids("2026-10-25"));
  });
});

describe("aboutPreview", () => {
  it("короткий текст — как есть", () => expect(aboutPreview("Тренер по силе")).toBe("Тренер по силе"));
  it("длинный — по границе слова с многоточием", () => {
    const text = "слово ".repeat(60).trim();
    const p = aboutPreview(text);
    expect(p.length).toBeLessThanOrEqual(ABOUT_PREVIEW + 1);
    expect(p.endsWith("слово…")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { itemByCode, PRICES, SHOP_ITEMS, shopItems } from "@/lib/shop/catalog";
import { avatarImage } from "@/lib/shop/avatars";
import { CARD_BG, contrast } from "@/lib/shop/contrast";

const of = (kind: string) => SHOP_ITEMS.filter((i) => i.kind === kind);

describe("каталог", () => {
  it("коды уникальны", () => {
    const codes = SHOP_ITEMS.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("цена по редкости у coins, 0 у free", () => {
    for (const i of SHOP_ITEMS) {
      if (i.acquire === "coins") expect(i.price, i.code).toBe(PRICES[i.kind][i.rarity]);
      if (i.acquire === "free") expect(i.price, i.code).toBe(0);
    }
  });

  it("количество по видам", () => {
    expect(of("avatar")).toHaveLength(12);
    expect(of("avatar").filter((i) => i.acquire === "free")).toHaveLength(3);
    expect(of("frame")).toHaveLength(6);
    expect(of("nickColor")).toHaveLength(8);
    expect(of("theme")).toHaveLength(11);
    expect(of("theme").map((i) => i.code)).toEqual(
      expect.arrayContaining(["theme:teal", "theme:graphite", "theme:indigo", "theme:amber", "theme:fuchsia", "theme:lime"]),
    );
  });

  it("у каждого аватара есть картинка", () => {
    for (const i of of("avatar")) expect(avatarImage(i.code), i.code).toBeTruthy();
    expect(avatarImage("avatar:nope")).toBeNull();
  });

  it("тексты без служебных слов", () => {
    for (const i of SHOP_ITEMS) expect(i.name.toLowerCase()).not.toMatch(/флаг|админ/);
  });

  it("itemByCode и shopItems", () => {
    expect(itemByCode("avatar:knight")?.name).toBe("Рыцарь");
    expect(itemByCode("x")).toBeNull();
    expect(itemByCode(null)).toBeNull();
    expect(shopItems("avatar")).toHaveLength(12);
  });

  it("цвета ника читаются на карточке в обеих темах", () => {
    for (const i of SHOP_ITEMS) {
      if (i.kind !== "nickColor") continue;
      expect(contrast(i.light, CARD_BG.light), i.code).toBeGreaterThanOrEqual(4.5);
      expect(contrast(i.dark, CARD_BG.dark), i.code).toBeGreaterThanOrEqual(4.5);
      for (const c of i.gradient?.light ?? []) expect(contrast(c, CARD_BG.light), i.code).toBeGreaterThanOrEqual(4.5);
      for (const c of i.gradient?.dark ?? []) expect(contrast(c, CARD_BG.dark), i.code).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("темы: primary виден на карточке, текст на primary читается", () => {
    for (const i of SHOP_ITEMS) {
      if (i.kind !== "theme") continue;
      for (const mode of ["light", "dark"] as const) {
        const t = i[mode];
        expect(contrast(t.primary, CARD_BG[mode]), `${i.code} ${mode}`).toBeGreaterThanOrEqual(3);
        expect(contrast(t.primaryForeground, t.primary), `${i.code} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { isSkin, itemByCode, PRICES, SHOP_ITEMS, shopItems, skinOf, type SkinPalette } from "@/lib/shop/catalog";
import { avatarImage } from "@/lib/shop/avatars";
import { CARD_BG, contrast, SEMANTIC_HEX } from "@/lib/shop/contrast";

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
    expect(of("theme")).toHaveLength(19);
    expect(of("theme").filter(isSkin).map((i) => i.code)).toEqual([
      "theme:cyberpunk",
      "theme:abyss",
      "theme:forge",
      "theme:sepia",
      "theme:arctic",
      "theme:jungle",
      "theme:vintage",
      "theme:sakura",
    ]);
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
      if (i.kind !== "theme" || isSkin(i)) continue;
      for (const mode of ["light", "dark"] as const) {
        const t = i[mode];
        expect(contrast(t.primary, CARD_BG[mode]), `${i.code} ${mode}`).toBeGreaterThanOrEqual(3);
        expect(contrast(t.primaryForeground, t.primary), `${i.code} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("скины: легендарные за 2000, режим и hex", () => {
    const skins = SHOP_ITEMS.filter(isSkin);
    for (const i of skins) {
      expect(i.rarity, i.code).toBe("legendary");
      expect(i.price, i.code).toBe(2000);
      expect(i.acquire, i.code).toBe("coins");
      for (const [key, value] of Object.entries(i.palette)) expect(value, `${i.code} ${key}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(skins.map((i) => i.mode)).toEqual(["dark", "dark", "dark", "light", "light", "dark", "dark", "light"]);
  });

  it("скины: контраст", () => {
    const pairs: [keyof SkinPalette, keyof SkinPalette, number][] = [
      ["foreground", "background", 7],
      ["cardForeground", "card", 7],
      ["popoverForeground", "popover", 7],
      ["sidebarForeground", "sidebar", 7],
      ["mutedForeground", "card", 4.5],
      ["mutedForeground", "background", 4.5],
      ["primaryForeground", "primary", 4.5],
      ["secondaryForeground", "secondary", 4.5],
      ["accentForeground", "accent", 4.5],
      ["sidebarPrimaryForeground", "sidebarPrimary", 4.5],
      ["sidebarAccentForeground", "sidebarAccent", 4.5],
      ...(["primary", "ring", "xp", "streak", "chart1", "chart2", "chart3", "chart4", "chart5", "series1", "series2", "series3", "series4", "series5"] as const).map(
        (k) => [k, "card", 3] as [keyof SkinPalette, keyof SkinPalette, number],
      ),
      ["border", "card", 1.3],
    ];
    for (const i of SHOP_ITEMS.filter(isSkin)) {
      const p = i.palette;
      for (const [fg, bg, min] of pairs) expect(contrast(p[fg], p[bg]), `${i.code} ${fg}/${bg}`).toBeGreaterThanOrEqual(min);
      for (const [name, hex] of Object.entries(SEMANTIC_HEX[i.mode])) {
        expect(contrast(hex, p.card), `${i.code} ${name}/card`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("скины: «восстановление» и «нужен отдых» различимы по яркости — и при дальтонизме", () => {
    // xp и streak красят соседние состояния на карте мышц; оттенок дальтоник может не различить, яркость — различит
    for (const i of SHOP_ITEMS.filter(isSkin)) {
      expect(contrast(i.palette.xp, i.palette.streak), i.code).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("скин по коду", () => {
    expect(skinOf("theme:cyberpunk")?.name).toBe("Киберпанк");
    expect(skinOf("theme:ocean")).toBeNull();
    expect(skinOf("theme:nope")).toBeNull();
    expect(skinOf(null)).toBeNull();
  });
});

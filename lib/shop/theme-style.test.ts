import { describe, expect, it } from "vitest";
import { isSkin, itemByCode, SHOP_ITEMS } from "@/lib/shop/catalog";
import { themeStyle } from "@/lib/shop/theme-style";

const kebab = (key: string) => `--${key.replace(/([A-Z])/g, "-$1").replace(/(\d)/g, "-$1").toLowerCase()}`;
const count = (s: string, part: string) => s.split(part).length - 1;

describe("themeStyle", () => {
  it("обычная тема — прежняя строка", () => {
    const item = itemByCode("theme:ocean");
    if (item?.kind !== "theme") throw new Error("нет theme:ocean");
    expect(themeStyle(item)).toBe(
      ":root:root{--primary:#0369a1;--primary-foreground:#ffffff;--ring:#0284c7;--chart-1:#0284c7;}:root.dark{--primary:#38bdf8;--primary-foreground:#082f49;--ring:#38bdf8;--chart-1:#38bdf8;}",
    );
  });

  it("скин — все токены в обоих селекторах и color-scheme", () => {
    const skins = SHOP_ITEMS.filter(isSkin);
    expect(skins).toHaveLength(8);
    for (const skin of skins) {
      const css = themeStyle(skin);
      expect(css, skin.code).toContain(":root:root{");
      expect(css, skin.code).toContain(":root.dark{");
      for (const [key, value] of Object.entries(skin.palette)) {
        expect(count(css, `${kebab(key)}:${value};`), `${skin.code} ${kebab(key)}`).toBe(2);
      }
      expect(count(css, `color-scheme:${skin.mode};`), skin.code).toBe(2);
    }
  });

  it("имена переменных — как в globals.css", () => {
    expect(kebab("cardForeground")).toBe("--card-foreground");
    expect(kebab("chart1")).toBe("--chart-1");
    expect(kebab("sidebarPrimaryForeground")).toBe("--sidebar-primary-foreground");
  });
});

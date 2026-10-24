import { isSkin, type ShopItem, type SkinItem, type ThemeTokens } from "@/lib/shop/catalog";

type ThemeItem = ShopItem & { kind: "theme" };

const block = (t: ThemeTokens) =>
  `--primary:${t.primary};--primary-foreground:${t.primaryForeground};--ring:${t.ring};--chart-1:${t.chart1};`;

/** Ключ палитры → CSS-переменная globals.css: cardForeground → --card-foreground, chart1 → --chart-1. */
const cssVar = (key: string) => `--${key.replace(/([A-Z])/g, "-$1").replace(/(\d)/g, "-$1").toLowerCase()}`;

const skinBlock = (skin: SkinItem) =>
  `color-scheme:${skin.mode};` + Object.entries(skin.palette).map(([key, value]) => `${cssVar(key)}:${value};`).join("");

/**
 * CSS надетой темы: четыре токена для светлой и тёмной темы. Двойной селектор перебивает :root/.dark
 * из globals.css независимо от порядка (next-themes ставит класс `dark` на <html>).
 * Значения — hex из каталога, не ввод пользователя.
 */
export function themeStyle(item: ThemeItem): string {
  // Скин: вся палитра одного режима в оба селектора — цвета верны при любом классе на <html> (режим держит ThemeModeLock)
  if (isSkin(item)) return `:root:root{${skinBlock(item)}}:root.dark{${skinBlock(item)}}`;
  return `:root:root{${block(item.light)}}:root.dark{${block(item.dark)}}`;
}

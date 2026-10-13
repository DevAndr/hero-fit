import type { ShopItem, ThemeTokens } from "@/lib/shop/catalog";

type ThemeItem = ShopItem & { kind: "theme" };

const block = (t: ThemeTokens) =>
  `--primary:${t.primary};--primary-foreground:${t.primaryForeground};--ring:${t.ring};--chart-1:${t.chart1};`;

/**
 * CSS надетой темы: четыре токена для светлой и тёмной темы. Двойной селектор перебивает :root/.dark
 * из globals.css независимо от порядка (next-themes ставит класс `dark` на <html>).
 * Значения — hex из каталога, не ввод пользователя.
 */
export function themeStyle(item: ThemeItem): string {
  return `:root:root{${block(item.light)}}:root.dark{${block(item.dark)}}`;
}

export type ItemKind = "avatar" | "frame" | "nickColor" | "theme";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Acquire = "coins" | "free" | "premium" | "reward";
export type ThemeTokens = { primary: string; primaryForeground: string; ring: string; chart1: string };

type Base = { code: string; name: string; rarity: Rarity; price: number; acquire: Acquire };
export type ShopItem = Base &
  (
    | { kind: "avatar" }
    | { kind: "frame"; ring: string }
    | { kind: "nickColor"; light: string; dark: string; gradient?: { light: [string, string]; dark: [string, string] } }
    | { kind: "theme"; light: ThemeTokens; dark: ThemeTokens }
  );

/** Цены по виду и редкости; у тем нет легендарных. */
export const PRICES: Record<ItemKind, Partial<Record<Rarity, number>>> = {
  avatar: { common: 150, rare: 400, epic: 900, legendary: 2000 },
  frame: { common: 100, rare: 300, epic: 700, legendary: 1500 },
  nickColor: { common: 200, rare: 500, epic: 1000, legendary: 1500 },
  theme: { common: 300, rare: 600, epic: 1000 },
};

const buy = (kind: ItemKind, rarity: Rarity) => PRICES[kind][rarity] ?? 0;

const avatar = (id: string, name: string, rarity: Rarity, free = false): ShopItem => ({
  code: `avatar:${id}`,
  kind: "avatar",
  name,
  rarity,
  price: free ? 0 : buy("avatar", rarity),
  acquire: free ? "free" : "coins",
});

const frame = (id: string, name: string, rarity: Rarity, ring: string): ShopItem => ({
  code: `frame:${id}`,
  kind: "frame",
  name,
  rarity,
  price: buy("frame", rarity),
  acquire: "coins",
  ring,
});

const nick = (
  id: string,
  name: string,
  rarity: Rarity,
  light: string,
  dark: string,
  gradient?: { light: [string, string]; dark: [string, string] },
): ShopItem => ({
  code: `nick:${id}`,
  kind: "nickColor",
  name,
  rarity,
  price: buy("nickColor", rarity),
  acquire: "coins",
  light,
  dark,
  gradient,
});

const theme = (id: string, name: string, rarity: Rarity, light: ThemeTokens, dark: ThemeTokens): ShopItem => ({
  code: `theme:${id}`,
  kind: "theme",
  name,
  rarity,
  price: buy("theme", rarity),
  acquire: "coins",
  light,
  dark,
});

export const SHOP_ITEMS: ShopItem[] = [
  // Аватары — герои
  avatar("knight", "Рыцарь", "common", true),
  avatar("viking", "Викинг", "common", true),
  avatar("ninja", "Ниндзя", "common", true),
  avatar("archer", "Лучник", "common"),
  avatar("monk", "Монах", "common"),
  avatar("mage", "Маг", "rare"),
  avatar("pirate", "Пират", "rare"),
  avatar("samurai", "Самурай", "rare"),
  avatar("paladin", "Паладин", "epic"),
  avatar("valkyrie", "Валькирия", "epic"),
  avatar("titan", "Титан", "legendary"),
  avatar("phoenix", "Феникс", "legendary"),

  // Рамки (без анимаций)
  frame("bronze", "Бронза", "common", "ring-2 ring-amber-700"),
  frame("silver", "Серебро", "rare", "ring-2 ring-slate-400"),
  frame("gold", "Золото", "rare", "ring-2 ring-amber-400"),
  frame("flame", "Пламя", "epic", "ring-2 ring-orange-500 shadow-[0_0_10px_2px_rgba(249,115,22,0.55)]"),
  frame("frost", "Иней", "epic", "ring-2 ring-sky-400 shadow-[0_0_10px_2px_rgba(56,189,248,0.5)]"),
  frame("royal", "Королевская", "legendary", "ring-[3px] ring-fuchsia-500 shadow-[0_0_14px_3px_rgba(217,70,239,0.55)]"),

  // Цвета ника
  nick("emerald", "Изумруд", "common", "#047857", "#34d399"),
  nick("sky", "Небо", "common", "#0369a1", "#38bdf8"),
  nick("sunset", "Закат", "rare", "#c2410c", "#fb923c"),
  nick("rose", "Роза", "rare", "#be123c", "#fb7185"),
  nick("violet", "Аметист", "rare", "#6d28d9", "#a78bfa"),
  nick("lava", "Лава", "epic", "#b91c1c", "#f87171", { light: ["#b91c1c", "#c2410c"], dark: ["#f87171", "#fb923c"] }),
  nick("aurora", "Северное сияние", "epic", "#0f766e", "#2dd4bf", { light: ["#0f766e", "#1d4ed8"], dark: ["#2dd4bf", "#60a5fa"] }),
  nick("royal", "Королевский", "legendary", "#a21caf", "#e879f9", { light: ["#a21caf", "#6d28d9"], dark: ["#e879f9", "#a78bfa"] }),

  // Темы
  theme(
    "ocean",
    "Океан",
    "common",
    { primary: "#0369a1", primaryForeground: "#ffffff", ring: "#0284c7", chart1: "#0284c7" },
    { primary: "#38bdf8", primaryForeground: "#082f49", ring: "#38bdf8", chart1: "#38bdf8" },
  ),
  theme(
    "forest",
    "Лес",
    "common",
    { primary: "#15803d", primaryForeground: "#ffffff", ring: "#16a34a", chart1: "#16a34a" },
    { primary: "#4ade80", primaryForeground: "#052e16", ring: "#4ade80", chart1: "#4ade80" },
  ),
  theme(
    "sunset",
    "Закат",
    "rare",
    { primary: "#c2410c", primaryForeground: "#ffffff", ring: "#ea580c", chart1: "#ea580c" },
    { primary: "#fb923c", primaryForeground: "#431407", ring: "#fb923c", chart1: "#fb923c" },
  ),
  theme(
    "night",
    "Ночь",
    "rare",
    { primary: "#6d28d9", primaryForeground: "#ffffff", ring: "#7c3aed", chart1: "#7c3aed" },
    { primary: "#a78bfa", primaryForeground: "#2e1065", ring: "#a78bfa", chart1: "#a78bfa" },
  ),
  theme(
    "ruby",
    "Рубин",
    "epic",
    { primary: "#be123c", primaryForeground: "#ffffff", ring: "#e11d48", chart1: "#e11d48" },
    { primary: "#fb7185", primaryForeground: "#4c0519", ring: "#fb7185", chart1: "#fb7185" },
  ),
  theme(
    "teal",
    "Бирюза",
    "common",
    { primary: "#0f766e", primaryForeground: "#ffffff", ring: "#0d9488", chart1: "#0d9488" },
    { primary: "#2dd4bf", primaryForeground: "#042f2e", ring: "#2dd4bf", chart1: "#2dd4bf" },
  ),
  theme(
    "graphite",
    "Графит",
    "common",
    { primary: "#334155", primaryForeground: "#ffffff", ring: "#475569", chart1: "#475569" },
    { primary: "#cbd5e1", primaryForeground: "#0f172a", ring: "#cbd5e1", chart1: "#cbd5e1" },
  ),
  theme(
    "indigo",
    "Индиго",
    "rare",
    { primary: "#4338ca", primaryForeground: "#ffffff", ring: "#4f46e5", chart1: "#4f46e5" },
    { primary: "#818cf8", primaryForeground: "#1e1b4b", ring: "#818cf8", chart1: "#818cf8" },
  ),
  theme(
    "amber",
    "Янтарь",
    "rare",
    { primary: "#b45309", primaryForeground: "#ffffff", ring: "#d97706", chart1: "#d97706" },
    { primary: "#fbbf24", primaryForeground: "#451a03", ring: "#fbbf24", chart1: "#fbbf24" },
  ),
  theme(
    "fuchsia",
    "Фуксия",
    "epic",
    { primary: "#a21caf", primaryForeground: "#ffffff", ring: "#c026d3", chart1: "#c026d3" },
    { primary: "#e879f9", primaryForeground: "#4a044e", ring: "#e879f9", chart1: "#e879f9" },
  ),
  theme(
    "lime",
    "Лайм",
    "epic",
    { primary: "#4d7c0f", primaryForeground: "#ffffff", ring: "#65a30d", chart1: "#65a30d" },
    { primary: "#a3e635", primaryForeground: "#1a2e05", ring: "#a3e635", chart1: "#a3e635" },
  ),
];

/**
 * «Стандартная» — карточка возврата к фирменной теме (`themeCode = null`), не предмет каталога: не продаётся и не
 * надевается кодом. Цвета — те же, что `--primary`/`--primary-foreground`/`--ring`/`--chart-1` в app/globals.css
 * (превью рисуется по ним, а не по переменным страницы — их перекрывает надетая тема).
 */
export const DEFAULT_THEME: ShopItem & { kind: "theme" } = {
  code: "theme:default",
  kind: "theme",
  name: "Стандартная",
  rarity: "common",
  price: 0,
  acquire: "free",
  light: {
    primary: "oklch(0.508 0.118 165.612)",
    primaryForeground: "oklch(0.985 0 0)",
    ring: "oklch(0.696 0.17 162.48)",
    chart1: "oklch(0.596 0.145 163.225)",
  },
  dark: {
    primary: "oklch(0.765 0.177 163.223)",
    primaryForeground: "oklch(0.21 0.034 264.665)",
    ring: "oklch(0.696 0.17 162.48)",
    chart1: "oklch(0.765 0.177 163.223)",
  },
};

const BY_CODE = new Map(SHOP_ITEMS.map((i) => [i.code, i]));

/** Предмет по коду; неизвестный (удалённый из каталога) или пустой — null. */
export function itemByCode(code: string | null | undefined): ShopItem | null {
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** Что можно купить или взять бесплатно (premium/reward в магазине не продаются). */
export function shopItems(kind: ItemKind): ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.kind === kind && (i.acquire === "coins" || i.acquire === "free"));
}

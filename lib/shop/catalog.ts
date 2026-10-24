export type ItemKind = "avatar" | "frame" | "nickColor" | "theme";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Acquire = "coins" | "free" | "premium" | "reward";
export type ThemeTokens = { primary: string; primaryForeground: string; ring: string; chart1: string };
/** Полная палитра скина (тема со своим фоном) — один режим, только #rrggbb (проверяется contrast()). */
export type SkinPalette = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
  series1: string;
  series2: string;
  series3: string;
  series4: string;
  series5: string;
  xp: string;
  streak: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
};

type Base = { code: string; name: string; rarity: Rarity; price: number; acquire: Acquire };
export type ShopItem = Base &
  (
    | { kind: "avatar" }
    | { kind: "frame"; ring: string }
    | { kind: "nickColor"; light: string; dark: string; gradient?: { light: [string, string]; dark: [string, string] } }
    | { kind: "theme"; light: ThemeTokens; dark: ThemeTokens }
    | { kind: "theme"; mode: "dark" | "light"; palette: SkinPalette }
  );

export type SkinItem = ShopItem & { kind: "theme"; mode: "dark" | "light"; palette: SkinPalette };

/** Цены по виду и редкости; легендарные темы — скины со своим фоном. */
export const PRICES: Record<ItemKind, Partial<Record<Rarity, number>>> = {
  avatar: { common: 150, rare: 400, epic: 900, legendary: 2000 },
  frame: { common: 100, rare: 300, epic: 700, legendary: 1500 },
  nickColor: { common: 200, rare: 500, epic: 1000, legendary: 1500 },
  theme: { common: 300, rare: 600, epic: 1000, legendary: 2000 },
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

/** Скин: своя палитра и свой режим — пока надет, кабинет в этом режиме (ThemeModeLock). */
const skin = (id: string, name: string, mode: "dark" | "light", palette: SkinPalette): ShopItem => ({
  code: `theme:${id}`,
  kind: "theme",
  name,
  rarity: "legendary",
  price: buy("theme", "legendary"),
  acquire: "coins",
  mode,
  palette,
});

/** Тёмная палитра из основных цветов: карточки, рамки и сайдбар — производные. */
const darkSkin = (c: {
  background: string;
  card: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
  charts: [string, string, string, string, string];
  xp: string;
  streak: string;
}): SkinPalette => skinPalette(c);

const skinPalette = (c: Parameters<typeof darkSkin>[0]): SkinPalette => ({
  background: c.background,
  foreground: c.foreground,
  card: c.card,
  cardForeground: c.foreground,
  popover: c.card,
  popoverForeground: c.foreground,
  primary: c.primary,
  primaryForeground: c.primaryForeground,
  secondary: c.muted,
  secondaryForeground: c.foreground,
  muted: c.muted,
  mutedForeground: c.mutedForeground,
  accent: c.muted,
  accentForeground: c.foreground,
  border: c.border,
  input: c.border,
  ring: c.primary,
  chart1: c.charts[0],
  chart2: c.charts[1],
  chart3: c.charts[2],
  chart4: c.charts[3],
  chart5: c.charts[4],
  series1: c.charts[0],
  series2: c.charts[1],
  series3: c.charts[2],
  series4: c.charts[3],
  series5: c.charts[4],
  xp: c.xp,
  streak: c.streak,
  sidebar: c.background,
  sidebarForeground: c.foreground,
  sidebarPrimary: c.primary,
  sidebarPrimaryForeground: c.primaryForeground,
  sidebarAccent: c.muted,
  sidebarAccentForeground: c.foreground,
  sidebarBorder: c.border,
  sidebarRing: c.primary,
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

  // Скины — темы со своим фоном и режимом
  skin(
    "cyberpunk",
    "Киберпанк",
    "dark",
    darkSkin({
      background: "#0d0221",
      card: "#1a0b2e",
      foreground: "#f5e9ff",
      muted: "#2a1747",
      mutedForeground: "#b9a3d9",
      primary: "#ff2e97",
      primaryForeground: "#1a0010",
      border: "#3d2a5c",
      charts: ["#ff2e97", "#00e5ff", "#f9f871", "#a855f7", "#39ff14"],
      xp: "#ffd60a",
      streak: "#ff7a1a",
    }),
  ),
  skin(
    "abyss",
    "Глубина",
    "dark",
    darkSkin({
      background: "#04121f",
      card: "#0b2236",
      foreground: "#e0f2fe",
      muted: "#133149",
      mutedForeground: "#93b4cc",
      primary: "#2dd4bf",
      primaryForeground: "#042f2e",
      border: "#1f4766",
      charts: ["#2dd4bf", "#60a5fa", "#fbbf24", "#c084fc", "#fb7185"],
      xp: "#fbbf24",
      streak: "#f97316",
    }),
  ),
  skin(
    "forge",
    "Кузница",
    "dark",
    darkSkin({
      background: "#14110f",
      card: "#221c18",
      foreground: "#f5efe6",
      muted: "#2f2722",
      mutedForeground: "#b8a99a",
      primary: "#f97316",
      primaryForeground: "#1c0a00",
      border: "#4a3d33",
      charts: ["#f97316", "#facc15", "#a3e635", "#38bdf8", "#e879f9"],
      xp: "#facc15",
      streak: "#ea580c",
    }),
  ),
  skin(
    "sepia",
    "Сепия",
    "light",
    skinPalette({
      background: "#f4ecd8",
      card: "#fbf6ea",
      foreground: "#3b2a1a",
      muted: "#ece1c8",
      mutedForeground: "#6b5440",
      primary: "#8b4513",
      primaryForeground: "#fbf6ea",
      border: "#d9c9a8",
      charts: ["#8b4513", "#b45309", "#4d7c0f", "#1d4ed8", "#be123c"],
      xp: "#a16207",
      streak: "#7c2d12",
    }),
  ),
  skin(
    "arctic",
    "Арктика",
    "light",
    skinPalette({
      background: "#eef6fb",
      card: "#ffffff",
      foreground: "#0c2233",
      muted: "#e1edf5",
      mutedForeground: "#4a6577",
      primary: "#0369a1",
      primaryForeground: "#ffffff",
      border: "#c9dbe7",
      charts: ["#0369a1", "#7c3aed", "#0f766e", "#c2410c", "#be185d"],
      xp: "#a16207",
      streak: "#7c2d12",
    }),
  ),
  skin(
    "jungle",
    "Джунгли",
    "dark",
    darkSkin({
      background: "#08140d",
      card: "#10251a",
      foreground: "#eafbe7",
      muted: "#1a3526",
      mutedForeground: "#9cc3a8",
      primary: "#a3e635",
      primaryForeground: "#1a2e05",
      border: "#2c4d3a",
      charts: ["#a3e635", "#34d399", "#fbbf24", "#60a5fa", "#f472b6"],
      xp: "#fde047",
      streak: "#f97316",
    }),
  ),
  skin(
    "vintage",
    "Винтаж",
    "dark",
    darkSkin({
      background: "#1a0a0e",
      card: "#2a1218",
      foreground: "#fbefe6",
      muted: "#3a1d24",
      mutedForeground: "#c9a9a3",
      primary: "#e7b75f",
      primaryForeground: "#2a1206",
      border: "#55303a",
      charts: ["#e7b75f", "#f87171", "#a3e635", "#60a5fa", "#c084fc"],
      xp: "#fcd34d",
      streak: "#f97316",
    }),
  ),
  skin(
    "sakura",
    "Сакура",
    "light",
    skinPalette({
      background: "#fdf0f3",
      card: "#ffffff",
      foreground: "#3a0d1f",
      muted: "#f8e1e8",
      mutedForeground: "#7a4a5c",
      primary: "#be185d",
      primaryForeground: "#ffffff",
      border: "#efcbd6",
      charts: ["#be185d", "#7c3aed", "#0f766e", "#b45309", "#1d4ed8"],
      xp: "#a16207",
      streak: "#7c2d12",
    }),
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

export function isSkin(item: ShopItem): item is SkinItem {
  return "palette" in item;
}

/** Скин по коду; обычная тема, другой предмет, неизвестный или пустой код — null. */
export function skinOf(code: string | null | undefined): SkinItem | null {
  const item = itemByCode(code);
  return item && isSkin(item) ? item : null;
}

/** Что можно купить или взять бесплатно (premium/reward в магазине не продаются). */
export function shopItems(kind: ItemKind): ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.kind === kind && (i.acquire === "coins" || i.acquire === "free"));
}

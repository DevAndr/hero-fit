/** Боссы недели — по кругу. Спрайты: `assets/icons/game/bosses/*.png` (components/boss/boss-sprite.tsx). */
export const BOSSES = [
  { code: "golem", name: "Железный Голем", lore: "Выкован из старых блинов и ржавых грифов. Удар не чувствует — только тоннаж." },
  { code: "troll", name: "Ледяной Тролль", lore: "Спит в ледяной пещере, пока кто-то не пропустит тренировку. Тает от честных подходов." },
  { code: "dragon", name: "Огненный Дракон", lore: "Копит не золото, а чужие рекорды. Пламя гаснет от каждого нового PR." },
  { code: "knight", name: "Теневой Рыцарь", lore: "Тень каждого, кто бросил на полпути. Не любит доведённые до конца подходы." },
  { code: "lich", name: "Костяной Лич", lore: "Древний маг, считающий кости, а не повторы. Боится тех, кто работает до отказа." },
  { code: "treant", name: "Лесной Древень", lore: "Корни уходят глубже фундамента зала. Рубить его — работа на много недель." },
  { code: "colossus", name: "Песчаный Колосс", lore: "Песок времени в его кулаках: каждая пропущенная неделя делает его тяжелее." },
  { code: "crystal", name: "Кристальный Страж", lore: "Отражает слабые удары обратно. Трещины идут только от тяжёлых подходов." },
  { code: "storm", name: "Грозовой Титан", lore: "Приходит с громом и уходит, когда стихает гул штанги." },
  { code: "queen", name: "Ядовитая Королева", lore: "Её яд — усталость и отговорки. Противоядие — регулярность." },
  { code: "runes", name: "Хранитель Рун", lore: "Стережёт руны силы. Открывает их только тому, кто приходит неделя за неделей." },
  { code: "void", name: "Пустотный Титан", lore: "Пожирает недоделанные тренировки. Насытить его можно только завершёнными." },
] as const;

export type BossCode = (typeof BOSSES)[number]["code"];

/** Понедельник, с которого идёт счёт недель. */
const EPOCH = Date.UTC(2024, 0, 1);
const WEEK_MS = 7 * 24 * 3_600_000;

/** Босс недели по её понедельнику («YYYY-MM-DD»). */
export function bossForWeek(week: string): BossCode {
  const n = Math.round((Date.parse(`${week}T00:00:00Z`) - EPOCH) / WEEK_MS);
  return BOSSES[((n % BOSSES.length) + BOSSES.length) % BOSSES.length].code;
}

/**
 * Сезонные боссы (флаг `seasonal_boss`) — отдельно от ротации: не на лендинге, не в «Легенде бестиария»,
 * ротацию `bossForWeek` не сдвигают (в свою неделю просто заменяют босса ротации).
 */
export const SEASONAL_BOSSES = [
  {
    code: "grinch",
    name: "Гринч",
    lore: "Крадёт не подарки, а декабрьские тренировки. Отступает перед теми, кто не бросил зал под Новый год.",
    hint: "Приходит под Новый год",
  },
] as const;

export type SeasonalCode = (typeof SEASONAL_BOSSES)[number]["code"];
/** Код любого босса недели: ротации или сезонного. */
export type AnyBossCode = BossCode | SeasonalCode;

/** Сезонный босс недели (понедельник «YYYY-MM-DD»): Гринч — в неделю, где 31 декабря; иначе null. */
export function seasonalBossForWeek(week: string): SeasonalCode | null {
  const monday = Date.parse(`${week}T00:00:00Z`);
  // 31 декабря недели — всегда того же года, что и понедельник
  const dec31 = Date.UTC(new Date(monday).getUTCFullYear(), 11, 31);
  return dec31 >= monday && dec31 - monday < WEEK_MS ? "grinch" : null;
}

/** Босс, которого ставим новой неделе: сезонный при включённом флаге, иначе ротация. */
export function weekBossCode(week: string, seasonalOn: boolean): AnyBossCode {
  return (seasonalOn && seasonalBossForWeek(week)) || bossForWeek(week);
}

const ALL_BOSSES: readonly { code: AnyBossCode; name: string; lore: string }[] = [...BOSSES, ...SEASONAL_BOSSES];

/** Описание босса для бестиария. */
export function bossLore(code: string): string {
  return ALL_BOSSES.find((b) => b.code === code)?.lore ?? "";
}

export function bossName(code: string): string {
  return ALL_BOSSES.find((b) => b.code === code)?.name ?? "Босс";
}

export function isSeasonalCode(code: string): code is SeasonalCode {
  return SEASONAL_BOSSES.some((b) => b.code === code);
}

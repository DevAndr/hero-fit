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

/** Описание босса для бестиария. */
export function bossLore(code: string): string {
  return BOSSES.find((b) => b.code === code)?.lore ?? "";
}

export function bossName(code: string): string {
  return BOSSES.find((b) => b.code === code)?.name ?? "Босс";
}

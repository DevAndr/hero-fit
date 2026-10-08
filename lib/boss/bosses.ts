/** Боссы недели — по кругу. Спрайты: `assets/icons/game/boss_<code>.png` (components/boss/boss-sprite.tsx). */
export const BOSSES = [
  { code: "golem", name: "Железный Голем" },
  { code: "troll", name: "Ледяной Тролль" },
  { code: "dragon", name: "Огненный Дракон" },
  { code: "knight", name: "Теневой Рыцарь" },
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

export function bossName(code: string): string {
  return BOSSES.find((b) => b.code === code)?.name ?? "Босс";
}

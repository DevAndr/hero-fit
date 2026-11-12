import { BOSSES, bossForWeek, SEASONAL_BOSSES, type BossCode, type SeasonalCode } from "@/lib/boss/bosses";
import { addWeeks } from "@/lib/progress/weekly-streak";
import { bossStars } from "@/lib/titles/catalog";

/** Неделя с боссом: победа (если была) и урон недели. */
export type BestiaryRow = { week: string; code: string; defeatedAt: Date | null; damage: number };

export type BestiaryEntry = {
  code: BossCode;
  name: string;
  wins: number;
  stars: 0 | 1 | 2 | 3;
  /** ISO; null — ни разу не побеждён. */
  firstWin: string | null;
  /** Лучший урон за неделю; 0 — не бился. */
  bestDamage: number;
  /** Через сколько недель снова на арене; 0 — босс текущей недели. */
  weeksUntil: number;
  /** Недели с боем (урон или победа), от новых к старым, не больше `HISTORY_LIMIT`. */
  history: { week: string; damage: number; won: boolean; current: boolean }[];
};

const HISTORY_LIMIT = 10;

/** Сезонный босс в «Редких»: без звёзд, ротации и истории. */
export type SeasonalEntry = { code: SeasonalCode; name: string; wins: number; firstWin: string | null; bestDamage: number };

/** Карточки сезонных боссов (Гринч) — отдельно от 12 основных. */
export function seasonalBestiary(rows: BestiaryRow[]): SeasonalEntry[] {
  return SEASONAL_BOSSES.map(({ code, name }) => {
    const mine = rows.filter((r) => r.code === code);
    const wins = mine.filter((r) => r.defeatedAt).map((r) => r.defeatedAt!.getTime());
    return {
      code,
      name,
      wins: wins.length,
      firstWin: wins.length ? new Date(Math.min(...wins)).toISOString() : null,
      bestDamage: Math.max(0, ...mine.map((r) => r.damage)),
    };
  });
}

/** Бестиарий: по карточке на каждого босса в порядке ротации. */
export function bestiary(rows: BestiaryRow[], currentWeek: string): BestiaryEntry[] {
  return BOSSES.map(({ code, name }) => {
    const mine = rows.filter((r) => r.code === code);
    const wins = mine.filter((r) => r.defeatedAt).map((r) => r.defeatedAt!.getTime());
    let weeksUntil = 0;
    while (weeksUntil < BOSSES.length && bossForWeek(addWeeks(currentWeek, weeksUntil)) !== code) weeksUntil++;
    return {
      code,
      name,
      wins: wins.length,
      stars: bossStars(wins.length),
      firstWin: wins.length ? new Date(Math.min(...wins)).toISOString() : null,
      bestDamage: Math.max(0, ...mine.map((r) => r.damage)),
      weeksUntil,
      history: mine
        .filter((r) => r.damage > 0 || r.defeatedAt)
        .sort((a, b) => b.week.localeCompare(a.week))
        .slice(0, HISTORY_LIMIT)
        .map((r) => ({ week: r.week, damage: r.damage, won: !!r.defeatedAt, current: r.week === currentWeek })),
    };
  });
}

import { BOSSES, bossForWeek, type BossCode } from "@/lib/boss/bosses";
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
};

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
    };
  });
}

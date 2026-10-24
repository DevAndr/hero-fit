import type { CoinReason } from "@/generated/prisma/enums";
import { addDays, weekStart } from "@/lib/dates";

/** График «Монеты» на /stats: откуда приходят монеты, по неделям. */

export const COIN_GROUPS = ["workout", "record", "achievement", "chest", "progress"] as const;
export type CoinGroup = (typeof COIN_GROUPS)[number];

export const COIN_GROUP_LABELS: Record<CoinGroup, string> = {
  workout: "Тренировки",
  record: "Рекорды",
  achievement: "Ачивки",
  chest: "Сундуки",
  progress: "Серия и уровни",
};

const GROUP_OF: Record<CoinReason, CoinGroup | null> = {
  WORKOUT: "workout",
  RECORD: "record",
  ACHIEVEMENT: "achievement",
  DAILY_CHEST: "chest",
  BOSS_CHEST: "chest",
  RAID_CHEST: "chest",
  GOAL_CHEST: "chest",
  CLUB_TASK_CHEST: "chest",
  GOBLIN_CHEST: "chest",
  STREAK_WEEK: "progress",
  LEVEL_UP: "progress",
  // Стартовый баланс — разовая сумма за всю прошлую историю, покупки — трата, не получение
  RETRO: null,
  PURCHASE: null,
};

export function coinGroup(reason: CoinReason): CoinGroup | null {
  return GROUP_OF[reason];
}

/** Строка запроса: сумма по местной неделе (понедельник) и причине. */
export type CoinWeekRow = { week: string; reason: CoinReason; amount: number };
export type CoinWeek = { week: string; total: number } & Record<CoinGroup, number>;

/** count недель до текущей включительно; недели без монет — нулями. */
export function coinWeeks(rows: CoinWeekRow[], today: string, count: number): CoinWeek[] {
  const last = weekStart(today);
  const weeks = Array.from({ length: count }, (_, i) => addDays(last, -7 * (count - 1 - i)));
  const acc = new Map<string, CoinWeek>(
    weeks.map((week) => [week, { week, workout: 0, record: 0, achievement: 0, chest: 0, progress: 0, total: 0 }]),
  );
  for (const r of rows) {
    const group = coinGroup(r.reason);
    const w = acc.get(r.week);
    if (!group || !w || r.amount <= 0) continue;
    w[group] += r.amount;
    w.total += r.amount;
  }
  return weeks.map((week) => acc.get(week)!);
}

/** Список клиентов тренера: имя, метки внимания, сортировка (чистые функции). */
import { dayKey } from "@/lib/daily-login";
import { plural } from "@/lib/format";
import { streakStatus, streakValue, weekKey, type StreakUserFields } from "@/lib/progress/weekly-streak";
import type { SignalKind } from "@/lib/coach/signals";

export type ClientRow = {
  id: string;
  name: string;
  level: number;
  lastWorkoutAt: Date | null;
  linkedAt: Date;
  /** Тренировок на этой неделе (в поясе клиента). */
  weekCount: number;
  streak: number;
  /** Упражнений с подсказкой «пора увеличить вес». */
  hints: number;
  /** Пояс клиента: «вчера» и неделя — по его календарю. */
  timeZone: string;
  /** Назначения тренера на эту неделю клиента: выполнено / всего; null — назначений нет. */
  plan: { done: number; total: number } | null;
  /** Сигналы риска (lib/coach/signals.ts). */
  signals: SignalKind[];
};

const DAY = 86_400_000;

/** Как тренер и клиент видят друг друга: ник, иначе имя. Логин и почту не показываем. */
export function clientDisplayName(u: { nickname: string | null; name: string | null }): string {
  return u.nickname || u.name || "Клиент";
}

/**
 * Сначала с сигналами: больше сигналов — выше, при равенстве давняя последняя тренировка выше (без тренировок — выше
 * всех); потом остальные — свежие выше.
 */
export function sortClients(rows: ClientRow[]): ClientRow[] {
  const last = (r: ClientRow) => r.lastWorkoutAt?.getTime() ?? -Infinity;
  // Без тренировок у обоих: -Infinity − -Infinity = NaN — сравниваем явно
  const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
  return [...rows].sort((a, b) => {
    const s = b.signals.length - a.signals.length;
    if (s) return s;
    return a.signals.length ? cmp(last(a), last(b)) : cmp(last(b), last(a));
  });
}

/** «сегодня», «вчера», «N дней назад» — по календарным дням в поясе клиента. */
export function lastWorkoutLabel(at: Date | null, now: Date, timeZone: string): string {
  if (!at) return "ещё не тренировался";
  const days = Math.round((Date.parse(dayKey(now, timeZone)) - Date.parse(dayKey(at, timeZone))) / DAY);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${plural(days, "день", "дня", "дней")} назад`;
}

/** Тренировок на этой неделе и живая серия — по календарю клиента (не тренера и не сервера). */
export function clientWeek(fields: StreakUserFields, now: Date, timeZone: string): { weekCount: number; streak: number } {
  return {
    weekCount: fields.weekWorkoutsKey === weekKey(now, timeZone) ? fields.weekWorkouts : 0,
    streak: streakValue(streakStatus(fields, now, timeZone)),
  };
}

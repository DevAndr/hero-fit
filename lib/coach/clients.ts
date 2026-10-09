/** Список клиентов тренера: имя, метки внимания, сортировка (чистые функции). */
import { dayKey } from "@/lib/daily-login";
import { plural } from "@/lib/format";

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
};

export type ClientFlags = { inactive: boolean; hints: number };

const DAY = 86_400_000;
const INACTIVE_MS = 7 * DAY;

/** Как тренер и клиент видят друг друга: ник, иначе имя. Логин и почту не показываем. */
export function clientDisplayName(u: { nickname: string | null; name: string | null }): string {
  return u.nickname || u.name || "Клиент";
}

export function clientFlags(row: ClientRow, now: Date): ClientFlags {
  const since = row.lastWorkoutAt ?? row.linkedAt;
  return { inactive: now.getTime() - since.getTime() >= INACTIVE_MS, hints: row.hints };
}

/** Сначала неактивные (без тренировок — выше всех, затем давние), потом с подсказками (давние выше), потом по свежести. */
export function sortClients(rows: ClientRow[], now: Date): ClientRow[] {
  const group = (r: ClientRow) => {
    const f = clientFlags(r, now);
    return f.inactive ? 0 : f.hints > 0 ? 1 : 2;
  };
  const last = (r: ClientRow) => r.lastWorkoutAt?.getTime() ?? -Infinity;
  return [...rows].sort((a, b) => {
    const g = group(a) - group(b);
    if (g) return g;
    // В группах внимания давние выше, в остальных — свежие выше
    return group(a) === 2 ? last(b) - last(a) : last(a) - last(b);
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

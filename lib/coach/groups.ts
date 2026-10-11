/** Группы клиентов тренера — метки для фильтра и быстрого выбора (чистые функции). */
import { z } from "zod";

export const COACH_GROUPS_MAX = 20;

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(40, "Не больше 40 символов"),
});

/** Ключ уникальности названия: без учёта регистра, пробелы схлопнуты. */
export function groupKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export type CoachGroupView = { id: string; name: string; clientIds: string[] };

/** Строки списка из группы; группы нет (не выбрана, удалена, чужая) — все. */
export function inGroup<T extends { id: string }>(rows: T[], group: CoachGroupView | null | undefined): T[] {
  if (!group) return rows;
  const ids = new Set(group.clientIds);
  return rows.filter((r) => ids.has(r.id));
}

/** Быстрый выбор: к отмеченным — участники группы, которые есть в списке; порядок — как в списке. */
export function addGroup(picked: string[], members: string[], available: string[]): string[] {
  const chosen = new Set([...picked, ...members]);
  const inList = new Set(available);
  return [...available.filter((id) => chosen.has(id)), ...picked.filter((id) => !inList.has(id))];
}

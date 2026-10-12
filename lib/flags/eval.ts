import { FLAG_KEYS, type FlagKey } from "@/lib/flags/registry";

export type FlagState = { enabled: boolean; percent: number; userIds: string[] };

/** Группа пользователя 0…99: FNV-1a 32 бита от «ключ:userId» — стабильно, у разных флагов — разные группы. */
export function bucket(key: string, userId: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${key}:${userId}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/** Нет строки или выключен — для всех (kill switch сильнее списка); список — всегда; иначе процент; гость — только 100 %. */
export function flagOn(key: string, state: FlagState | null, userId: string | null): boolean {
  if (!state?.enabled) return false;
  if (userId === null) return state.percent >= 100;
  if (state.userIds.includes(userId)) return true;
  return bucket(key, userId) < state.percent;
}

/** Включённые флаги реестра (строки с ключами не из реестра — устаревшие — не учитываются). */
export function enabledKeys(states: Map<string, FlagState>, userId: string | null): FlagKey[] {
  return FLAG_KEYS.filter((key) => flagOn(key, states.get(key) ?? null, userId));
}

/**
 * Чек-ин «Как ты сегодня?» без сети: ответ остаётся на устройстве и уходит при появлении сети или следующем открытии.
 * Убирается при любом ответе сервера (и при отказе — тренировка уже закрыта); копится только сетевой сбой.
 */
export const WELLBEING_PREFIX = "hf:wellbeing:";

export type WellbeingValue = "GREAT" | "OK" | "TIRED";
type Save = (workoutId: string, value: WellbeingValue) => Promise<{ ok: boolean }>;
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const VALUES = new Set<string>(["GREAT", "OK", "TIRED"]);

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function pendingWellbeing(store: Storage | null = storage()): { workoutId: string; value: WellbeingValue }[] {
  if (!store) return [];
  const out: { workoutId: string; value: WellbeingValue }[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      const v = k?.startsWith(WELLBEING_PREFIX) ? store.getItem(k) : null;
      if (k && v && VALUES.has(v)) out.push({ workoutId: k.slice(WELLBEING_PREFIX.length), value: v as WellbeingValue });
    }
  } catch {
    // хранилище недоступно — нечего отправлять
  }
  return out;
}

/** Отправить ответ; без сети — оставить в очереди. */
export async function sendWellbeing(workoutId: string, value: WellbeingValue, save: Save, store: Storage | null = storage()) {
  const key = WELLBEING_PREFIX + workoutId;
  try {
    store?.setItem(key, value);
  } catch {
    // не запомнили — отправим хотя бы сейчас
  }
  try {
    await save(workoutId, value);
  } catch {
    return; // сеть: ждём следующей попытки
  }
  try {
    store?.removeItem(key);
  } catch {
    // не критично
  }
}

export async function flushWellbeing(save: Save, store: Storage | null = storage()) {
  for (const p of pendingWellbeing(store)) await sendWellbeing(p.workoutId, p.value, save, store);
}

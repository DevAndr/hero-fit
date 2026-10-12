import { PAIN_SPOTS, type PainSpot } from "@/lib/assistant/rules";

/**
 * Боль из чата помощника — только на устройстве и только для одной тренировки: данные о здоровье (152-ФЗ, ст. 10)
 * на сервер не уходят, в черновик тренировки не входят.
 */
export const PAIN_PREFIX = "hf:pain:";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const SPOTS = new Set<string>(PAIN_SPOTS.map((p) => p.spot));

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPain(workoutId: string, store: Storage | null = storage()): PainSpot[] {
  try {
    const raw = store?.getItem(PAIN_PREFIX + workoutId);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s): s is PainSpot => typeof s === "string" && SPOTS.has(s)) : [];
  } catch {
    return [];
  }
}

export function writePain(workoutId: string, spots: PainSpot[], store: Storage | null = storage()) {
  try {
    store?.setItem(PAIN_PREFIX + workoutId, JSON.stringify([...new Set(spots)]));
  } catch {
    // хранилище недоступно — помощник просто не запомнит боль
  }
}

/** Убрать боль одной (завершённой) тренировки. */
export function clearPain(workoutId: string, store: Storage | null = storage()) {
  try {
    store?.removeItem(PAIN_PREFIX + workoutId);
  } catch {
    // не критично
  }
}

/** Убрать боль других тренировок (вместе с офлайн-черновиками). */
export function prunePain(keepId: string | null, store: Storage | null = storage()) {
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(PAIN_PREFIX) && k !== PAIN_PREFIX + keepId) keys.push(k);
    }
    for (const k of keys) store.removeItem(k);
  } catch {
    // не критично
  }
}

import type { WorkoutState } from "@/components/training/workout-state";

/**
 * Черновик тренировки на устройстве — на случай, когда в зале нет связи.
 * Каждое изменение пишется сюда сразу; на сервер — когда получится (см. use-workout-sync).
 */
export type OfflineRecord = {
  v: 1;
  workoutId: string;
  state: WorkoutState;
  /** Когда состояние последний раз менялось на устройстве (мс). */
  savedAt: number;
  /** Сервер подтвердил именно это состояние. */
  synced: boolean;
  /** Начали без сети — время старта с устройства, ещё не отправлено. */
  pendingStart: string | null;
  /** Завершили без сети — время завершения с устройства, ещё не отправлено. */
  pendingFinish: string | null;
};

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

const PREFIX = "hf:workout:";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // приватный режим / запрет на хранилище — работаем как раньше, только с сервером
  }
}

export function readRecord(workoutId: string, store: Storage | null = storage()): OfflineRecord | null {
  try {
    const raw = store?.getItem(PREFIX + workoutId);
    if (!raw) return null;
    const rec = JSON.parse(raw) as OfflineRecord;
    return rec?.v === 1 && rec.workoutId === workoutId && rec.state ? rec : null;
  } catch {
    return null;
  }
}

export function writeRecord(rec: OfflineRecord, store: Storage | null = storage()) {
  try {
    store?.setItem(PREFIX + rec.workoutId, JSON.stringify(rec));
  } catch {
    // переполнено / запрещено — серверное автосохранение всё равно работает
  }
}

export function clearRecord(workoutId: string, store: Storage | null = storage()) {
  try {
    store?.removeItem(PREFIX + workoutId);
  } catch {
    // нечего чистить
  }
}

/** Убрать черновики других тренировок (завершённых/отменённых где-то ещё) и старше недели. */
export function pruneRecords(keepId: string | null, now = Date.now(), store: Storage | null = storage()) {
  if (!store) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const id = k.slice(PREFIX.length);
      const rec = readRecord(id, store);
      if (id !== keepId || !rec || now - rec.savedAt > MAX_AGE_MS) store.removeItem(k);
    }
  } catch {
    // не критично
  }
}

/**
 * Какое состояние поднять при открытии редактора: с устройства — если там есть то, чего сервер ещё не знает
 * (не отправленный черновик, старт или финиш без сети) и оно новее серверного; иначе — с сервера.
 */
export function pickInitial(server: { updatedAt: string }, rec: OfflineRecord | null) {
  const unsent = rec && (!rec.synced || rec.pendingStart || rec.pendingFinish);
  if (rec && unsent && rec.savedAt >= Date.parse(server.updatedAt)) return { state: rec.state, restored: true };
  return { state: null, restored: false };
}

// Имена кэшей — те же, что в public/sw.js
export const PAGES_CACHE = "hf-pages-v1";
const STATIC_CACHE = "hf-static-v1";

/**
 * Обновить копию /training в кэше service worker'а (для открытия без сети): после создания тренировки
 * страница меняется без полной навигации, и закэшированный HTML иначе остался бы старым.
 */
export function refreshTrainingCache() {
  if (typeof caches === "undefined" || !navigator.onLine) return;
  void caches
    .open(PAGES_CACHE)
    .then((cache) => cache.add(new Request("/training", { credentials: "same-origin" })))
    .catch(() => {});
  // Скрипты и стили этой страницы могли загрузиться до того, как service worker начал перехватывать
  // запросы, — кладём в кэш сами, иначе без сети страница откроется без JS.
  const assets = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((u) => new URL(u).origin === location.origin && new URL(u).pathname.startsWith("/_next/static/"));
  if (assets.length) {
    void caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll([...new Set(assets)]))
      .catch(() => {});
  }
}

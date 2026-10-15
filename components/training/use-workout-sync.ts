"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearRecord, writeRecord, type OfflineRecord } from "@/components/training/offline-store";
import { toDraft, type WorkoutState } from "@/components/training/workout-state";
import { finishWorkoutAction, saveWorkoutDraftAction, startWorkoutAction } from "@/lib/workouts/actions";

/** saved — сервер знает всё; offline — нет связи, всё сохранено на устройстве и уйдёт само. */
export type SyncStatus = "saved" | "dirty" | "saving" | "offline" | "error";

const DEBOUNCE_MS = 700;
const RETRY_MS = 15_000;

/**
 * Черновик тренировки: сразу на устройство (localStorage), затем на сервер — debounce, по одному запросу,
 * по порядку: старт → черновик → завершение. Нет сети — копим и повторяем: при появлении сети,
 * при возврате в приложение, раз в 15 с и по кнопке «Синхронизировать».
 */
export function useWorkoutSync(
  workoutId: string,
  state: WorkoutState,
  onFinishError: (error: string) => void,
  /** Сервер при сохранении черновика выпустил Золотого гоблина (флаг). */
  onGoblin?: (goblin: { spawnedAt: string }) => void,
) {
  const [status, setStatus] = useState<SyncStatus>("saved");
  const [queuedFinish, setQueuedFinish] = useState<string | null>(null);
  const record = useRef<OfflineRecord>({
    v: 1,
    workoutId,
    state,
    savedAt: Date.now(),
    synced: true,
    pendingStart: null,
    pendingFinish: null,
  });
  const savedJson = useRef(JSON.stringify(toDraft(state)));
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const first = useRef(true);
  const finishErrorRef = useRef(onFinishError);
  const goblinRef = useRef(onGoblin);
  const finishRejected = useRef(false);
  useEffect(() => {
    finishErrorRef.current = onFinishError;
    goblinRef.current = onGoblin;
  });

  const persist = useCallback((patch: Partial<OfflineRecord>) => {
    record.current = { ...record.current, ...patch };
    writeRecord(record.current);
  }, []);

  const syncOnce = useCallback(async () => {
    const rec = record.current;
    if (rec.pendingStart) {
      // Отказ («уже начата» / «нельзя начать») — старт уже не нужен; сетевая ошибка — исключение, повторим.
      await startWorkoutAction(workoutId, rec.pendingStart);
      persist({ pendingStart: null });
    }
    // Пока отправляли, могли ввести ещё — сохраняем, пока не догоним.
    for (;;) {
      const draft = toDraft(record.current.state);
      const json = JSON.stringify(draft);
      if (json === savedJson.current) break;
      setStatus("saving");
      const result = await saveWorkoutDraftAction(workoutId, draft);
      if (!result.ok) {
        setStatus("error");
        return;
      }
      savedJson.current = json;
      if (result.goblin) goblinRef.current?.(result.goblin);
      if (JSON.stringify(toDraft(record.current.state)) === json) persist({ synced: true });
    }
    const finishAt = record.current.pendingFinish;
    if (finishAt) {
      setStatus("saving");
      const result = await finishWorkoutAction(workoutId, toDraft(record.current.state), finishAt);
      // Успех — action уводит на сводку (там же черновик удаляется с устройства). Отказ — показываем.
      if (result && !result.ok) {
        finishRejected.current = true;
        persist({ pendingFinish: null });
        setQueuedFinish(null);
        finishErrorRef.current(result.error ?? "Не удалось завершить тренировку");
      } else {
        record.current = { ...record.current, pendingFinish: null };
        clearRecord(workoutId);
      }
    }
    setStatus("saved");
  }, [persist, workoutId]);

  /** Один проход синхронизации за раз; сетевая ошибка → «offline», повторим позже. */
  const run = useCallback(async () => {
    while (inFlight.current) await inFlight.current;
    const request = (async () => {
      try {
        await syncOnce();
      } catch {
        setStatus("offline");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = request;
    await request;
  }, [syncOnce]);

  // Каждое изменение — сразу на устройство, на сервер — с задержкой.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const json = JSON.stringify(toDraft(state));
    persist({ state, savedAt: Date.now(), synced: record.current.synced && json === savedJson.current });
    if (json === savedJson.current) return;
    setStatus("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), DEBOUNCE_MS);
  }, [state, persist, run]);

  // Повторы: появилась сеть, вернулись в приложение, раз в 15 с, пока не отправили.
  useEffect(() => {
    const retry = () => {
      const r = record.current;
      if (!r.synced || r.pendingStart || r.pendingFinish) void run();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") retry();
      else {
        window.clearTimeout(timer.current);
        void run(); // сворачиваем — сохраняем сразу
      }
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      if (navigator.onLine) retry();
    }, RETRY_MS);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [run]);

  /** Черновик с устройства поднят при открытии — помечаем как неотправленный и отправляем. */
  const restore = useCallback(
    (rec: OfflineRecord) => {
      record.current = { ...rec, synced: false };
      savedJson.current = "";
      setQueuedFinish(rec.pendingFinish);
      setStatus("dirty");
      void run();
    },
    [run],
  );

  /** Старт — сразу на устройстве (время с него), на сервер — в очередь. */
  const queueStart = useCallback(
    (at: string) => {
      persist({ pendingStart: at });
      void run();
    },
    [persist, run],
  );

  /**
   * Завершение: «sent» — сервер принял (идёт переход на сводку); «queued» — нет сети, ждёт в очереди
   * со временем с устройства; «rejected» — сервер отказал (ошибка уже показана).
   */
  const queueFinish = useCallback(
    async (at: string): Promise<"sent" | "queued" | "rejected"> => {
      finishRejected.current = false;
      persist({ pendingFinish: at });
      setQueuedFinish(at);
      await run();
      if (record.current.pendingFinish) return "queued";
      return finishRejected.current ? "rejected" : "sent";
    },
    [persist, run],
  );

  /** Сохранить немедленно и дождаться (перед отменой). */
  const settle = useCallback(async () => {
    window.clearTimeout(timer.current);
    await run();
  }, [run]);

  return { status, queuedFinish, syncNow: run, settle, restore, queueStart, queueFinish };
}

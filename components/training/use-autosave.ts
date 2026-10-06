"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveWorkoutDraftAction } from "@/lib/workouts/actions";
import type { WorkoutDraft } from "@/lib/workouts/schema";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const DEBOUNCE_MS = 700;

/**
 * Автосохранение черновика: debounce + не больше одного запроса одновременно,
 * чтобы старое состояние не перезаписало новое из-за гонки ответов.
 */
export function useAutosave(workoutId: string, draft: WorkoutDraft) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(draft);
  const savedJson = useRef(JSON.stringify(draft));
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const run = useCallback(async (): Promise<void> => {
    // Пока пользователь вводит данные, черновик мог измениться — сохраняем, пока не догоним.
    for (;;) {
      while (inFlight.current) await inFlight.current;
      const json = JSON.stringify(latest.current);
      if (json === savedJson.current) {
        setStatus("saved");
        return;
      }
      setStatus("saving");
      let ok = false;
      const request = (async () => {
        try {
          ok = (await saveWorkoutDraftAction(workoutId, latest.current)).ok;
          if (ok) savedJson.current = json;
        } catch {
          ok = false;
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = request;
      await request;
      if (!ok) {
        setStatus("error");
        return;
      }
    }
  }, [workoutId]);

  useEffect(() => {
    latest.current = draft;
    if (JSON.stringify(draft) === savedJson.current) return;
    setStatus("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(), DEBOUNCE_MS);
  }, [draft, run]);

  // Уходим со страницы или сворачиваем приложение — сохраняем сразу.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(timer.current);
        void run();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [run]);

  /** Сохранить немедленно и дождаться (перед стартом/финишем/отменой). */
  const settle = useCallback(async () => {
    window.clearTimeout(timer.current);
    await run();
  }, [run]);

  return { status, settle };
}

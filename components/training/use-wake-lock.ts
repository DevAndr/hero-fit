"use client";

import { useEffect } from "react";

/**
 * Экран не гаснет, пока `active` (идёт тренировка). Браузер снимает блокировку, когда вкладку скрывают, —
 * при возврате запрашиваем снова. Без поддержки Wake Lock API (или при отказе) — молча ничего.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let disposed = false;

    const request = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (disposed) void lock.release();
        else sentinel = lock;
      } catch {
        // Нет разрешения, экономия заряда и т. п. — просто работаем без блокировки
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}

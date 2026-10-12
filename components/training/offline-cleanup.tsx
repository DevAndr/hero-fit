"use client";

import { useEffect } from "react";
import { clearRecord, pruneRecords } from "@/components/training/offline-store";
import { clearPain, prunePain } from "@/components/assistant/pain-store";

/**
 * Уборка черновиков на устройстве. `workoutId` — тренировка завершена (сводка): удаляем её черновик.
 * Без него — активной тренировки нет (отменили/завершили на другом устройстве): удаляем все.
 */
export function OfflineCleanup({ workoutId }: { workoutId?: string }) {
  useEffect(() => {
    if (workoutId) {
      clearRecord(workoutId);
      // Только эту: сводка старой тренировки не должна стирать боль идущей
      clearPain(workoutId);
    }
    // Без сети страница могла прийти из кэша service worker'а и быть устаревшей — ничего не удаляем.
    else if (navigator.onLine) {
      pruneRecords(null);
      prunePain(null);
    }
  }, [workoutId]);
  return null;
}

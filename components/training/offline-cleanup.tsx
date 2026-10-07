"use client";

import { useEffect } from "react";
import { clearRecord, pruneRecords } from "@/components/training/offline-store";

/**
 * Уборка черновиков на устройстве. `workoutId` — тренировка завершена (сводка): удаляем её черновик.
 * Без него — активной тренировки нет (отменили/завершили на другом устройстве): удаляем все.
 */
export function OfflineCleanup({ workoutId }: { workoutId?: string }) {
  useEffect(() => {
    if (workoutId) clearRecord(workoutId);
    // Без сети страница могла прийти из кэша service worker'а и быть устаревшей — ничего не удаляем.
    else if (navigator.onLine) pruneRecords(null);
  }, [workoutId]);
  return null;
}

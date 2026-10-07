import "server-only";
import { runNotificationTick } from "@/lib/notifications/service";

const INTERVAL_MS = 5_000;
const globalForWorker = globalThis as unknown as { heroFitNotificationWorker?: NodeJS.Timeout };

/**
 * Фоновая отправка уведомлений внутри процесса Next.js (self-hosted `next start`).
 * На serverless вместо этого вызывайте GET /api/cron/notifications по расписанию.
 */
export function startNotificationWorker() {
  if (globalForWorker.heroFitNotificationWorker) return;
  let running = false;
  globalForWorker.heroFitNotificationWorker = setInterval(async () => {
    if (running) return; // предыдущий тик ещё идёт
    running = true;
    try {
      await runNotificationTick();
    } catch (e) {
      console.error("[notifications] tick failed", e);
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  globalForWorker.heroFitNotificationWorker.unref?.();
}

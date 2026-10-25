/** Сбоев подряд на хосте ntfy, после которых админам уходит алерт. */
export const NTFY_FAIL_THRESHOLD = 5;
/** Повторный алерт — не чаще раза в час. */
export const NTFY_ALERT_EVERY_MS = 3_600_000;

/** Серия неудачных отправок на наш ntfy; record → true, когда пора слать алерт админам. */
export function createNtfyHealth() {
  let failures = 0;
  let lastAlertAt: number | null = null;
  return {
    record(ok: boolean, now: number): boolean {
      if (ok) {
        failures = 0;
        return false;
      }
      failures++;
      if (failures < NTFY_FAIL_THRESHOLD) return false;
      if (lastAlertAt !== null && now - lastAlertAt < NTFY_ALERT_EVERY_MS) return false;
      lastAlertAt = now;
      return true;
    },
  };
}

/**
 * Что отправка значит для здоровья ntfy: true — принял, false — сбой (5xx, таймаут), null — не считаем
 * (чужой хост, ntfy не настроен, 404/410 — подписка умерла, сам ntfy жив).
 */
export function ntfyOutcome(endpoint: string, ntfy: string | null, result: "ok" | number | undefined): boolean | null {
  if (!ntfy || new URL(endpoint).hostname.toLowerCase() !== ntfy) return null;
  if (result === "ok") return true;
  return result === 404 || result === 410 ? null : false;
}

/** Общий счётчик процесса (как лимит алертов в lib/errors/notify.ts). */
export const ntfyHealth = createNtfyHealth();

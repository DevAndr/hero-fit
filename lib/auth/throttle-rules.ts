/**
 * Ограничение подбора пароля — чистые правила. Неудачи считаются в окне 15 минут; на пороге — блокировка
 * на 15 минут (в блокировке не принимается даже верный пароль). Истекло окно или блокировка — счёт заново.
 */

export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
/** По введённому логину/email (есть такой аккаунт или нет) и по IP — за одним IP бывает целый зал за NAT. */
export const LIMITS = { id: 5, ip: 20 } as const;

export type ThrottleRecord = { failures: number; windowStart: Date; lockedUntil: Date | null };

export function lockedFor(r: ThrottleRecord | null, now: Date): number {
  return r?.lockedUntil ? Math.max(0, r.lockedUntil.getTime() - now.getTime()) : 0;
}

export function afterFailure(r: ThrottleRecord | null, now: Date, limit: number): ThrottleRecord {
  const expired = !r || now.getTime() - r.windowStart.getTime() > WINDOW_MS || (r.lockedUntil !== null && r.lockedUntil <= now);
  const failures = expired ? 1 : r.failures + 1;
  return {
    failures,
    windowStart: expired ? now : r.windowStart,
    lockedUntil: failures >= limit ? new Date(now.getTime() + LOCK_MS) : null,
  };
}

export const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

export const throttleMessage = (ms: number) => `Слишком много попыток входа. Попробуйте через ${minutesLeft(ms)} мин.`;

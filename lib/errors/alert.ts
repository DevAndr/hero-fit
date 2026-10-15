export const ALERT_GROUP_INTERVAL_MS = 3_600_000;
export const ALERT_HOURLY_MAX = 20;

/** Telegram о группе: новая или вернувшаяся, не чаще раза в час на группу и не больше 20 за час всего. */
export function shouldAlert(
  g: { isNew: boolean; reopened: boolean; alertedAt: Date | null },
  now: Date,
  sentLastHour: number,
): boolean {
  if (!g.isNew && !g.reopened) return false;
  if (sentLastHour >= ALERT_HOURLY_MAX) return false;
  return !g.alertedAt || now.getTime() - g.alertedAt.getTime() > ALERT_GROUP_INTERVAL_MS;
}

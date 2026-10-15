export const ALERT_GROUP_INTERVAL_MS = 3_600_000;

const SOURCE_LABEL = { SERVER: "сервер", CLIENT: "браузер" } as const;

/**
 * Текст оповещения в Telegram — без текста ошибки и пути: в них бывают персональные данные и коды приглашений,
 * а Telegram — передача за границу (152-ФЗ). Подробности — по ссылке в админке.
 */
export function alertText(
  group: { id: string; source: "SERVER" | "CLIENT"; version: string | null },
  kind: "new" | "back",
  appUrl: string,
) {
  return [
    kind === "new" ? "🔴 Новая ошибка" : "🔁 Ошибка вернулась",
    [SOURCE_LABEL[group.source], group.version ? `v${group.version}` : null].filter(Boolean).join(" · "),
    `${appUrl}/admin/errors/${group.id}`,
  ].join("\n");
}
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

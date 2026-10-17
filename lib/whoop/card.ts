import type { WhoopMatch, WhoopSummary } from "./match";

/** Сколько ждём активность WHOOP после тренировки, прежде чем сказать «не записал». */
export const WHOOP_WAIT_MS = 48 * 3_600_000;

/** За сколько дней до подключения грузится история WHOOP (callback OAuth). */
export const WHOOP_HISTORY_MS = 30 * 24 * 3_600_000;

/**
 * Тренировка раньше загруженной истории (подключение − 30 дн) и активностей рядом нет — мы просто не грузили это время:
 * карточку не показываем, а не «WHOOP не записал». Активности есть (догрузили «Обновить» или вебхуком) — показываем.
 */
export function outsideHistory(finishedAt: Date, connectedAt: Date, candidates: number): boolean {
  return candidates === 0 && finishedAt.getTime() < connectedAt.getTime() - WHOOP_HISTORY_MS;
}

export type WhoopCardState =
  | { kind: "data"; summary: WhoopSummary }
  | { kind: "pending" }
  | { kind: "waiting" }
  | { kind: "none" }
  | { kind: "reauth" };

/** Состояние карточки WHOOP в сводке: переподключение важнее данных; без совпадения — ждём 48 ч. */
export function cardState(match: WhoopMatch, finishedAt: Date, now: Date, needsReauth: boolean): WhoopCardState {
  if (needsReauth) return { kind: "reauth" };
  if (match) return match;
  return now.getTime() - finishedAt.getTime() < WHOOP_WAIT_MS ? { kind: "waiting" } : { kind: "none" };
}

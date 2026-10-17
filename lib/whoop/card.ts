import type { WhoopMatch, WhoopSummary } from "./match";

/** Сколько ждём активность WHOOP после тренировки, прежде чем сказать «не записал». */
export const WHOOP_WAIT_MS = 48 * 3_600_000;

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

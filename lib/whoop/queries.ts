import "server-only";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import type { GroupRecovery } from "@/lib/progress/recovery";
import { cardState, outsideHistory, type WhoopCardState } from "./card";
import { whoopConfigured } from "./config";
import { matchWhoop } from "./match";
import {
  baseline,
  recoveryZone,
  todaySleep,
  whoopAdvice,
  yesterdaySleep,
  type Advice,
  type RecoveryZone,
  type SleepNight,
} from "./recovery";
import { hasScope } from "./scopes";
import type { WhoopScoreState, WhoopWorkoutRow } from "./types";

export type WhoopStatus =
  | { connected: false }
  | { connected: true; since: Date; needsReauth: boolean; lastSyncAt: Date | null; recovery: boolean };

/** Интеграция доступна пользователю: WHOOP настроен на сервере и флаг `whoop` включён. */
export async function whoopAvailable(userId: string): Promise<boolean> {
  return whoopConfigured() && (await isEnabled("whoop", userId));
}

/** Статус подключения для /devices и строки в /settings (без токенов). */
export async function getWhoopStatus(userId: string): Promise<WhoopStatus> {
  const conn = await db.whoopConnection.findUnique({
    where: { userId },
    select: { createdAt: true, needsReauth: true, lastSyncAt: true, scopes: true },
  });
  if (!conn) return { connected: false };
  return {
    connected: true,
    since: conn.createdAt,
    needsReauth: conn.needsReauth,
    lastSyncAt: conn.lastSyncAt,
    // Сон и восстановление передаются, только если выданы оба scope
    recovery: hasScope(conn.scopes, "read:recovery") && hasScope(conn.scopes, "read:sleep"),
  };
}

/**
 * Карточка WHOOP в сводке тренировки. `null` — тренировка не завершена, без времени, WHOOP не подключён
 * или тренировка старше загруженной истории и активностей рядом нет (`outsideHistory`).
 * Кандидаты — активности, пересекающиеся с тренировкой (`start < finishedAt && end > startedAt`).
 */
export async function getWhoopCard(
  userId: string,
  w: { startedAt: Date | null; finishedAt: Date | null; status: string },
): Promise<WhoopCardState | null> {
  if (w.status !== "COMPLETED" || !w.startedAt || !w.finishedAt) return null;
  const conn = await db.whoopConnection.findUnique({ where: { userId }, select: { needsReauth: true, createdAt: true } });
  if (!conn) return null;
  const rows = await db.whoopWorkout.findMany({
    where: { userId, start: { lt: w.finishedAt }, end: { gt: w.startedAt } },
    select: { id: true, start: true, end: true, sportName: true, scoreState: true, strain: true, avgHr: true, maxHr: true, kilojoule: true, zonesMs: true },
  });
  if (outsideHistory(w.finishedAt, conn.createdAt, rows.length)) return null;
  const candidates: WhoopWorkoutRow[] = rows.map((r) => ({ ...r, scoreState: r.scoreState as WhoopScoreState }));
  const match = matchWhoop({ startedAt: w.startedAt, finishedAt: w.finishedAt }, candidates);
  return cardState(match, w.finishedAt, new Date(), conn.needsReauth);
}

export type WhoopRecoveryView =
  | { state: "no-access" } // подключён, нет read:recovery
  | { state: "reauth" } // needsReauth
  | { state: "empty"; yesterdayPct: number | null }
  | {
      state: "data";
      zone: RecoveryZone | null;
      recoveryPct: number | null;
      pending: boolean;
      calibrating: boolean;
      hrvMs: number | null;
      restingHr: number | null;
      sleepMs: number | null;
      performancePct: number | null;
      advice: Advice[];
    };

const RECOVERY_WINDOW_MS = 9 * 24 * 60 * 60 * 1000;

/**
 * Вид восстановления для дашборда, тренировки и помощника. `null` — WHOOP недоступен или не подключён.
 * `muscles` передаётся снаружи (`getMuscleRecovery`).
 */
export async function getWhoopRecovery(
  userId: string,
  timeZone: string,
  muscles: GroupRecovery[],
  now: Date = new Date(),
): Promise<WhoopRecoveryView | null> {
  if (!(await whoopAvailable(userId))) return null;
  const [conn, nights] = await Promise.all([
    db.whoopConnection.findUnique({ where: { userId }, select: { needsReauth: true, scopes: true } }),
    db.whoopSleep.findMany({
      where: { userId, end: { gte: new Date(now.getTime() - RECOVERY_WINDOW_MS) } },
      orderBy: { end: "desc" },
      select: {
        end: true,
        sleepScoreState: true,
        sleepMs: true,
        needMs: true,
        performancePct: true,
        recoveryScoreState: true,
        recoveryPct: true,
        restingHr: true,
        hrvMs: true,
        calibrating: true,
      },
    }),
  ]);
  if (!conn) return null;
  if (conn.needsReauth) return { state: "reauth" };
  if (!hasScope(conn.scopes, "read:recovery") || !hasScope(conn.scopes, "read:sleep")) return { state: "no-access" };

  const today = todaySleep(nights as SleepNight[], now, timeZone);
  const yesterday = yesterdaySleep(nights as SleepNight[], now, timeZone);
  if (!today) return { state: "empty", yesterdayPct: yesterday?.recoveryPct ?? null };

  const pending = today.recoveryScoreState !== "SCORED" || today.recoveryPct === null;
  const recoveryPct = pending ? null : today.recoveryPct;
  return {
    state: "data",
    zone: pending ? null : recoveryZone(today.recoveryPct),
    recoveryPct,
    pending,
    calibrating: today.calibrating,
    hrvMs: today.hrvMs,
    restingHr: today.restingHr,
    sleepMs: today.sleepMs,
    performancePct: today.performancePct,
    advice: whoopAdvice({
      today: pending ? { ...today, recoveryPct: null } : today,
      yesterday,
      base: baseline(nights, today),
      muscles,
    }),
  };
}

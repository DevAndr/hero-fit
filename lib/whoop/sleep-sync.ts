import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { whoopGet } from "./client";
import { toWhoopRecovery, toWhoopSleep } from "./map";
import { hasScope } from "./scopes";
import type { WhoopApiRecovery, WhoopApiSleep, WhoopRecoveryRow } from "./types";

type Page<T> = { records?: T[]; next_token?: string | null };

/** Предохранитель от бесконечной пагинации (25 × 200 = 5000 записей — с запасом на 30 дней). */
const MAX_PAGES = 200;

/** Подключение на старте синхронизации: аккаунт WHOOP и выданные scope; null — не подключён. */
async function connection(userId: string): Promise<{ whoopUserId: string; scopes: string } | null> {
  return db.whoopConnection.findUnique({ where: { userId }, select: { whoopUserId: true, scopes: true } });
}

/**
 * Запись — только пока подключён тот же аккаунт WHOOP, что на старте синхронизации (152-ФЗ, см. `sync.ts`):
 * строка подключения блокируется `FOR SHARE` в той же транзакции, отключение ждёт конца записи.
 */
async function writeIfConnected(userId: string, whoopUserId: string, write: (tx: Prisma.TransactionClient) => Promise<unknown>): Promise<void> {
  await db.$transaction(async (tx) => {
    const conn = await tx.$queryRaw<{ whoopUserId: string }[]>`select "whoopUserId" from "WhoopConnection" where "userId" = ${userId} for share`;
    if (conn[0]?.whoopUserId !== whoopUserId) return;
    await write(tx);
  });
}

/** Сон (без полей восстановления — они остаются как есть); дневной сон и битая запись пропускаются. */
async function upsertSleep(userId: string, whoopUserId: string, s: WhoopApiSleep): Promise<void> {
  const row = toWhoopSleep(s);
  if (!row) return;
  await writeIfConnected(userId, whoopUserId, (tx) =>
    tx.whoopSleep.upsert({ where: { id: row.id }, create: { ...row, userId }, update: { ...row, userId } }),
  );
}

/** Поля восстановления в уже сохранённый сон; сна нет (дневной сон, ещё не пришёл) — пропуск. */
async function applyRecovery(userId: string, whoopUserId: string, r: WhoopRecoveryRow): Promise<void> {
  const { sleepId, ...fields } = r;
  await writeIfConnected(userId, whoopUserId, (tx) => tx.whoopSleep.updateMany({ where: { id: sleepId, userId }, data: fields }));
}

/** Сны и восстановления WHOOP за [from, to]; запросы только с выданными scope (иначе WHOOP ответит 401 → needsReauth). */
export async function syncSleepRange(userId: string, from: Date, to: Date): Promise<void> {
  const conn = await connection(userId);
  if (!conn || !hasScope(conn.scopes, "read:sleep")) return;
  const { whoopUserId } = conn;
  const range = { start: from.toISOString(), end: to.toISOString(), limit: "25" };

  let nextToken: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: Page<WhoopApiSleep> | null = await whoopGet<Page<WhoopApiSleep>>(userId, "/v2/activity/sleep", nextToken ? { ...range, nextToken } : range);
    if (!data) return;
    for (const s of Array.isArray(data.records) ? data.records : []) await upsertSleep(userId, whoopUserId, s);
    nextToken = typeof data.next_token === "string" ? data.next_token : null;
    if (!nextToken) break;
  }

  if (!hasScope(conn.scopes, "read:recovery")) return;
  nextToken = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: Page<WhoopApiRecovery> | null = await whoopGet<Page<WhoopApiRecovery>>(userId, "/v2/recovery", nextToken ? { ...range, nextToken } : range);
    if (!data) return;
    for (const r of Array.isArray(data.records) ? data.records : []) {
      const row = toWhoopRecovery(r);
      if (row) await applyRecovery(userId, whoopUserId, row);
    }
    nextToken = typeof data.next_token === "string" ? data.next_token : null;
    if (!nextToken) return;
  }
}

/** Один сон по id (вебхук `sleep.updated`); нет в WHOOP — удалить у нас. Без `read:sleep` — ничего. */
export async function syncSleepOne(userId: string, whoopUserId: string, sleepId: string): Promise<void> {
  const conn = await connection(userId);
  if (!conn || !hasScope(conn.scopes, "read:sleep")) return;
  const s = await whoopGet<WhoopApiSleep>(userId, `/v2/activity/sleep/${encodeURIComponent(sleepId)}`);
  if (!s) {
    await removeSleep(userId, sleepId);
    return;
  }
  await upsertSleep(userId, whoopUserId, s);
}

/**
 * Восстановление по id сна (вебхук `recovery.updated`; id события — uuid сна). Восстановление может прийти раньше
 * вебхука сна, поэтому сначала сохраняем сам сон. Нужны оба scope: `read:sleep` (сон) и `read:recovery`.
 */
export async function syncRecoveryOne(userId: string, whoopUserId: string, sleepId: string): Promise<void> {
  const conn = await connection(userId);
  if (!conn || !hasScope(conn.scopes, "read:sleep") || !hasScope(conn.scopes, "read:recovery")) return;
  const s = await whoopGet<WhoopApiSleep>(userId, `/v2/activity/sleep/${encodeURIComponent(sleepId)}`);
  if (!s) {
    await removeSleep(userId, sleepId);
    return;
  }
  if (!toWhoopSleep(s)) return; // дневной сон / битая запись
  await upsertSleep(userId, whoopUserId, s);
  const r = await whoopGet<WhoopApiRecovery>(userId, `/v2/cycle/${encodeURIComponent(String(s.cycle_id))}/recovery`);
  if (!r) {
    await clearRecovery(userId, sleepId);
    return;
  }
  const row = toWhoopRecovery(r);
  if (row) await applyRecovery(userId, whoopUserId, { ...row, sleepId });
}

/** Удаление сна (вебхук `sleep.deleted`). */
export async function removeSleep(userId: string, sleepId: string): Promise<void> {
  await db.whoopSleep.deleteMany({ where: { id: sleepId, userId } });
}

/** Восстановления больше нет (вебхук `recovery.deleted`): сон остаётся, поля восстановления очищаются. */
export async function clearRecovery(userId: string, sleepId: string): Promise<void> {
  await db.whoopSleep.updateMany({
    where: { id: sleepId, userId },
    data: { recoveryScoreState: null, recoveryPct: null, restingHr: null, hrvMs: null, calibrating: false },
  });
}

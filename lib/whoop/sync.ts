import "server-only";
import { db } from "@/lib/db";
import { whoopGet } from "./client";
import { toWhoopWorkout } from "./map";
import type { WhoopApiWorkout } from "./types";

type WorkoutPage = { records?: WhoopApiWorkout[]; next_token?: string | null };

/** Предохранитель от бесконечной пагинации (25 × 200 = 5000 активностей — с запасом на 30 дней). */
const MAX_PAGES = 200;

/**
 * Запись активности — только пока подключён тот же аккаунт WHOOP, что на старте синхронизации (152-ФЗ: после отзыва
 * согласия данных быть не должно; после переподключения другого аккаунта активности прежнего не пишем).
 * Строка подключения блокируется `FOR SHARE` в той же транзакции: отключение (`DELETE` подключения) ждёт конца
 * записи и следом удаляет активности, а запись после отключения не находит подключения и пропускается.
 * Битая запись (нет id, кривые даты) пропускается — `toWhoopWorkout` вернёт null, до Prisma она не дойдёт.
 */
async function upsertWorkout(userId: string, whoopUserId: string, w: WhoopApiWorkout): Promise<void> {
  const row = toWhoopWorkout(w);
  if (!row) return;
  await db.$transaction(async (tx) => {
    const conn = await tx.$queryRaw<{ whoopUserId: string }[]>`select "whoopUserId" from "WhoopConnection" where "userId" = ${userId} for share`;
    if (conn[0]?.whoopUserId !== whoopUserId) return;
    await tx.whoopWorkout.upsert({
      where: { id: row.id },
      create: { ...row, userId },
      update: { ...row, userId },
    });
  });
}

/** Аккаунт WHOOP, подключённый на старте синхронизации; null — не подключён. */
async function connectedAccount(userId: string): Promise<string | null> {
  const conn = await db.whoopConnection.findUnique({ where: { userId }, select: { whoopUserId: true } });
  return conn?.whoopUserId ?? null;
}

/** Активности WHOOP за [from, to]: страницы по 25 до пустого `next_token`, upsert каждой. */
export async function syncRange(userId: string, from: Date, to: Date): Promise<void> {
  const whoopUserId = await connectedAccount(userId);
  if (!whoopUserId) return;
  let nextToken: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string> = { start: from.toISOString(), end: to.toISOString(), limit: "25" };
    if (nextToken) query.nextToken = nextToken;
    const data = await whoopGet<WorkoutPage>(userId, "/v2/activity/workout", query);
    if (!data) return;
    for (const w of Array.isArray(data.records) ? data.records : []) await upsertWorkout(userId, whoopUserId, w);
    nextToken = typeof data.next_token === "string" ? data.next_token : null;
    if (!nextToken) return;
  }
}

/**
 * Одна активность по id (вебхук `workout.updated`); нет в WHOOP — удалить у нас.
 * `whoopUserId` — аккаунт из события: подключение сменилось на другой аккаунт — запись пропускается.
 */
export async function syncOne(userId: string, whoopUserId: string, whoopId: string): Promise<void> {
  const w = await whoopGet<WhoopApiWorkout>(userId, `/v2/activity/workout/${encodeURIComponent(whoopId)}`);
  if (!w) {
    await removeOne(userId, whoopId);
    return;
  }
  await upsertWorkout(userId, whoopUserId, w);
}

/** Удаление активности (вебхук `workout.deleted`). */
export async function removeOne(userId: string, whoopId: string): Promise<void> {
  await db.whoopWorkout.deleteMany({ where: { id: whoopId, userId } });
}

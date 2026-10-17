import "server-only";
import { db } from "@/lib/db";
import { whoopGet } from "./client";
import { toWhoopWorkout } from "./map";
import type { WhoopApiWorkout } from "./types";

type WorkoutPage = { records?: WhoopApiWorkout[]; next_token?: string | null };

/** Предохранитель от бесконечной пагинации (25 × 200 = 5000 активностей — с запасом на 30 дней). */
const MAX_PAGES = 200;

/**
 * Запись активности — только пока WHOOP подключён (152-ФЗ: после отзыва согласия данных быть не должно).
 * Строка подключения блокируется `FOR SHARE` в той же транзакции: отключение (`DELETE` подключения) ждёт конца
 * записи и следом удаляет активности, а запись после отключения не находит подключения и пропускается.
 */
async function upsertWorkout(userId: string, w: WhoopApiWorkout): Promise<void> {
  const row = toWhoopWorkout(w);
  await db.$transaction(async (tx) => {
    const conn = await tx.$queryRaw<unknown[]>`select 1 from "WhoopConnection" where "userId" = ${userId} for share`;
    if (conn.length === 0) return;
    await tx.whoopWorkout.upsert({
      where: { id: row.id },
      create: { ...row, userId },
      update: row,
    });
  });
}

/** Активности WHOOP за [from, to]: страницы по 25 до пустого `next_token`, upsert каждой. */
export async function syncRange(userId: string, from: Date, to: Date): Promise<void> {
  let nextToken: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query: Record<string, string> = { start: from.toISOString(), end: to.toISOString(), limit: "25" };
    if (nextToken) query.nextToken = nextToken;
    const data = await whoopGet<WorkoutPage>(userId, "/v2/activity/workout", query);
    if (!data) return;
    for (const w of data.records ?? []) await upsertWorkout(userId, w);
    nextToken = data.next_token;
    if (!nextToken) return;
  }
}

/** Одна активность по id (вебхук `workout.updated`); нет в WHOOP — удалить у нас. */
export async function syncOne(userId: string, whoopId: string): Promise<void> {
  const w = await whoopGet<WhoopApiWorkout>(userId, `/v2/activity/workout/${encodeURIComponent(whoopId)}`);
  if (!w) {
    await removeOne(userId, whoopId);
    return;
  }
  await upsertWorkout(userId, w);
}

/** Удаление активности (вебхук `workout.deleted`). */
export async function removeOne(userId: string, whoopId: string): Promise<void> {
  await db.whoopWorkout.deleteMany({ where: { id: whoopId, userId } });
}

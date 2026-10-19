"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import type { WhoopCardState } from "./card";
import { revokeAccess } from "./client";
import { getWhoopCard, whoopAvailable } from "./queries";
import { syncSleepRange } from "./sleep-sync";
import { syncRange } from "./sync";
import { WhoopReauthError, WhoopUnavailableError } from "./tokens";

/** «Обновить» — не чаще раза в минуту на пользователя. */
const REFRESH_THROTTLE_MS = 60_000;
/** Запас вокруг тренировки при догрузке: активность WHOOP могла начаться раньше или кончиться позже. */
const REFRESH_MARGIN_MS = 30 * 60_000;

export type WhoopRefreshResult = { status: "ok"; card: WhoopCardState } | { status: "throttled" | "unavailable" | "reauth" };

/** Отключить WHOOP: отзыв доступа в WHOOP (ошибки игнорируем), затем удаление всех данных WHOOP у нас. */
export async function disconnectWhoopAction(): Promise<void> {
  const user = await requireUser();
  await revokeAccess(user.id);
  // Сначала подключение: удаление ждёт загрузку, держащую строку подключения (FOR SHARE в sync.ts), и после него
  // активности удаляются уже вместе с только что записанными; новые записи без подключения не пройдут
  await db.$transaction([
    db.whoopConnection.deleteMany({ where: { userId: user.id } }),
    db.whoopWorkout.deleteMany({ where: { userId: user.id } }),
    db.whoopSleep.deleteMany({ where: { userId: user.id } }),
  ]);
  revalidatePath("/devices");
  revalidatePath("/settings");
}

/** Догрузить активности WHOOP вокруг своей завершённой тренировки и вернуть карточку сводки. */
export async function refreshWhoopAction(workoutId: string): Promise<WhoopRefreshResult> {
  const user = await requireUser();
  if (typeof workoutId !== "string" || !(await whoopAvailable(user.id))) return { status: "unavailable" };
  const workout = await db.workout.findFirst({
    where: { id: workoutId, userId: user.id, status: "COMPLETED" },
    select: { startedAt: true, finishedAt: true, status: true },
  });
  if (!workout?.startedAt || !workout.finishedAt) return { status: "unavailable" };

  const conn = await db.whoopConnection.findUnique({ where: { userId: user.id }, select: { needsReauth: true } });
  if (!conn || conn.needsReauth) return { status: "reauth" };

  // Условное обновление — атомарный троттлинг: из двух одновременных нажатий пройдёт одно
  const now = new Date();
  const { count } = await db.whoopConnection.updateMany({
    where: { userId: user.id, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - REFRESH_THROTTLE_MS) } }] },
    data: { lastSyncAt: now },
  });
  if (count === 0) return { status: "throttled" };

  try {
    await syncRange(
      user.id,
      new Date(workout.startedAt.getTime() - REFRESH_MARGIN_MS),
      new Date(workout.finishedAt.getTime() + REFRESH_MARGIN_MS),
    );
  } catch (e) {
    if (e instanceof WhoopReauthError) return { status: "reauth" };
    // Наружу (onRequestError → мониторинг) не пробрасываем: message ошибки Prisma может содержать пульс/ккал
    if (!(e instanceof WhoopUnavailableError)) console.error("[whoop] refresh", (e as Error).name);
    return { status: "unavailable" };
  }

  const card = await getWhoopCard(user.id, workout);
  return card ? { status: "ok", card } : { status: "reauth" };
}

/** Сны и тренировки за последние дни — «Обновить» на карточке восстановления. */
const RECOVERY_REFRESH_DAYS = 3;

/** «Обновить» на дашборде: сны, восстановления и тренировки за 3 дня; ограничение общее с «Обновить» в сводке (lastSyncAt). */
export async function refreshWhoopRecoveryAction(): Promise<{ status: "ok" | "throttled" | "unavailable" | "reauth" }> {
  const user = await requireUser();
  if (!(await whoopAvailable(user.id))) return { status: "unavailable" };

  const conn = await db.whoopConnection.findUnique({ where: { userId: user.id }, select: { needsReauth: true } });
  if (!conn || conn.needsReauth) return { status: "reauth" };

  const now = new Date();
  const { count } = await db.whoopConnection.updateMany({
    where: { userId: user.id, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - REFRESH_THROTTLE_MS) } }] },
    data: { lastSyncAt: now },
  });
  if (count === 0) return { status: "throttled" };

  const from = new Date(now.getTime() - RECOVERY_REFRESH_DAYS * 86_400_000);
  try {
    await syncRange(user.id, from, now);
    await syncSleepRange(user.id, from, now);
  } catch (e) {
    if (e instanceof WhoopReauthError) return { status: "reauth" };
    if (!(e instanceof WhoopUnavailableError)) console.error("[whoop] refresh recovery", (e as Error).name);
    return { status: "unavailable" };
  }
  revalidatePath("/dashboard");
  return { status: "ok" };
}

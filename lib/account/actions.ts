"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { queueGoal } from "@/lib/analytics/queue";
import { clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookies";
import { requireUser } from "@/lib/auth/dal";
import { verifyPassword } from "@/lib/auth/password";
import { sessionEmbedded } from "@/lib/auth/session";
import { throttleKeys, throttleLock, recordLoginFailure } from "@/lib/auth/throttle";
import { minutesLeft } from "@/lib/auth/throttle-rules";
import { verifyAccessToken, verifyRefreshToken } from "@/lib/auth/tokens";
import { deleteAccount } from "@/lib/account/delete";
import { db } from "@/lib/db";
import { revokeAccess } from "@/lib/whoop/client";

type Refusal = { ok: false; error: string; field?: "password" | "confirm" };

/**
 * Удалить аккаунт сразу и навсегда (152-ФЗ). Подтверждение — паролем (неудачи считает тот же счётчик, что вход),
 * у учётки без пароля — своим логином. Успех — выход и переход на лендинг.
 */
export async function deleteAccountAction(input: { password?: string; confirm?: string }): Promise<Refusal> {
  const user = await requireUser();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { login: true, passwordHash: true } });

  if (row.passwordHash) {
    const keys = throttleKeys(row.login, (await headers()).get("x-real-ip"));
    const locked = await throttleLock(keys);
    if (locked) return { ok: false, error: `Слишком много попыток — попробуйте через ${minutesLeft(locked)} мин`, field: "password" };
    if (!(await verifyPassword(row.passwordHash, String(input.password ?? "")))) {
      await recordLoginFailure(keys);
      return { ok: false, error: "Неверный пароль", field: "password" };
    }
  } else if (String(input.confirm ?? "").trim().toLowerCase() !== row.login.toLowerCase()) {
    return { ok: false, error: "Логин не совпадает", field: "confirm" };
  }

  // Встроенная сессия (Mini App) — cookies с атрибутами фрейма; узнаём до удаления (сессии уйдут каскадом)
  const store = await cookies();
  const access = await verifyAccessToken(store.get(ACCESS_COOKIE)?.value);
  const refresh = await verifyRefreshToken(store.get(REFRESH_COOKIE)?.value);
  const embedded = await sessionEmbedded(access?.sessionId ?? refresh?.sessionId);

  // Отзыв доступа WHOOP — до транзакции (HTTP внутри неё нельзя); ошибки глотаются, строки уйдут каскадом
  await revokeAccess(user.id);

  // Каскады по многим таблицам и чужие итоги недели — дольше умолчания в 5 с (как у завершения тренировки)
  await db.$transaction((tx) => deleteAccount(tx, user.id), { timeout: 30_000 });
  clearAuthCookies(store, { embedded });
  await queueGoal("account_deleted");
  redirect("/?deleted=1");
}

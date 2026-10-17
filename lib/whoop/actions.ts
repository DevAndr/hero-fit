"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { revokeAccess } from "./client";

/** Отключить WHOOP: отзыв доступа в WHOOP (ошибки игнорируем), затем удаление всех данных WHOOP у нас. */
export async function disconnectWhoopAction(): Promise<void> {
  const user = await requireUser();
  await revokeAccess(user.id);
  // Сначала подключение: удаление ждёт загрузку, держащую строку подключения (FOR SHARE в sync.ts), и после него
  // активности удаляются уже вместе с только что записанными; новые записи без подключения не пройдут
  await db.$transaction([
    db.whoopConnection.deleteMany({ where: { userId: user.id } }),
    db.whoopWorkout.deleteMany({ where: { userId: user.id } }),
  ]);
  revalidatePath("/devices");
  revalidatePath("/settings");
}

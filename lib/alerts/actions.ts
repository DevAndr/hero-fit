"use server";

import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** «Закрыл навсегда»: клиент уже скрыл оповещение, ответ ему не важен — удалённое или чужой id тихо игнорируем. */
export async function dismissAlertAction(id: unknown): Promise<{ ok: true }> {
  const user = await requireUser();
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return { ok: true };
  const alert = await db.systemAlert.findFirst({ where: { id, dismiss: "FOREVER" }, select: { id: true } });
  if (!alert) return { ok: true };
  try {
    await db.systemAlertDismissal.createMany({ data: [{ alertId: id, userId: user.id }], skipDuplicates: true });
  } catch (e) {
    // Оповещение удалили между проверкой и записью — внешний ключ; остальное — в лог
    if (!(e instanceof Error && "code" in e && e.code === "P2003")) console.error("[alerts] dismiss failed", e);
  }
  return { ok: true };
}

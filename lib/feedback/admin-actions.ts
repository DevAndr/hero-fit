"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { notificationText, shouldNotify } from "./rules";
import { adminPatchSchema } from "./schema";

type Result = { ok: true } | { ok: false; error: string };

/** Статус и заметка из /admin/feedback; итог (сделано/отклонено) — уведомление автору. */
export async function updateFeedbackAction(id: string, patch: unknown): Promise<Result> {
  const admin = await requireAdmin();
  if (typeof id !== "string") return { ok: false, error: "Обращение не найдено" };
  const parsed = adminPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const p = parsed.data;

  const error = await db.$transaction(async (tx) => {
    const current = await tx.feedback.findUnique({ where: { id }, select: { status: true, userId: true, body: true } });
    if (!current) return "Обращение не найдено";
    const stale = "Обращение уже изменили — обновите страницу";
    if (p.expected && p.expected !== current.status) return stale;
    // Условно по прежнему статусу: два админа одновременно не пришлют автору два уведомления
    const { count } = await tx.feedback.updateMany({
      where: { id, status: current.status },
      data: { ...(p.status ? { status: p.status } : {}), ...(p.adminNote !== undefined ? { adminNote: p.adminNote } : {}) },
    });
    if (count === 0) return stale;
    const next = p.status ?? current.status;
    if ((next === "DONE" || next === "REJECTED") && shouldNotify(current.status, next)) {
      await notify(tx, current.userId, { type: "FEEDBACK", ...notificationText(next, current.body) }, { push: true });
    }
    return null;
  });
  if (error) return { ok: false, error };
  console.info(`[feedback] ${admin.login}: ${id} ${p.status ?? "note"}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

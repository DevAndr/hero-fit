"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { alertInputSchema } from "./schema";

type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND: Result = { ok: false, error: "Оповещение не найдено — обновите страницу" };

/** Создать (id = null) или изменить оповещение из /admin/alerts. */
export async function saveAlertAction(id: string | null, input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = alertInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const a = parsed.data;
  const data = {
    kind: a.kind,
    tone: a.tone,
    // У строки заголовка нет
    title: a.kind === "POPUP" ? (a.title ?? null) : null,
    body: a.body,
    ctaLabel: a.ctaLabel ?? null,
    ctaHref: a.ctaHref ?? null,
    dismiss: a.dismiss,
    audience: a.audience,
    startsAt: new Date(a.startsAt),
    endsAt: a.endsAt ? new Date(a.endsAt) : null,
  };
  if (id) {
    const { count } = await db.systemAlert.updateMany({ where: { id }, data });
    if (count === 0) return NOT_FOUND;
  } else {
    id = (await db.systemAlert.create({ data: { ...data, createdBy: admin.login }, select: { id: true } })).id;
  }
  console.info(`[alerts] ${admin.login}: save ${id}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Включить или выключить — выключение действует со следующей загрузки страницы у каждого. */
export async function toggleAlertAction(id: string, enabled: boolean): Promise<Result> {
  const admin = await requireAdmin();
  const { count } = await db.systemAlert.updateMany({ where: { id }, data: { enabled: enabled === true } });
  if (count === 0) return NOT_FOUND;
  console.info(`[alerts] ${admin.login}: ${enabled ? "enable" : "disable"} ${id}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Удалить навсегда (записи о закрытии — каскадом). */
export async function deleteAlertAction(id: string): Promise<Result> {
  const admin = await requireAdmin();
  await db.systemAlert.deleteMany({ where: { id } });
  console.info(`[alerts] ${admin.login}: delete ${id}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

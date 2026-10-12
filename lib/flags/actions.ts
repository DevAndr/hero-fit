"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { isFlagKey } from "@/lib/flags/registry";
import { flagPatchSchema, MAX_FLAG_USERS } from "@/lib/flags/schema";
import { invalidateFlags } from "@/lib/flags/server";
import { nicknameKey } from "@/lib/social/league";

type Result = { ok: true } | { ok: false; error: string };

/** Правка флага из /admin/flags: переключатель (kill switch), процент, список пользователей. */
export async function saveFlagAction(key: string, patch: unknown): Promise<Result> {
  const admin = await requireAdmin();
  if (!isFlagKey(key)) return { ok: false, error: "Неизвестный флаг" };
  const parsed = flagPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const p = parsed.data;

  const current = await db.featureFlag.findUnique({ where: { key }, select: { userIds: true } });
  let userIds = current?.userIds ?? [];
  if (p.addUser) {
    const q = p.addUser;
    const user = await db.user.findFirst({
      where: { OR: [{ login: { equals: q, mode: "insensitive" } }, { nicknameKey: nicknameKey(q) }] },
      select: { id: true },
    });
    if (!user) return { ok: false, error: "Пользователь не найден" };
    if (!userIds.includes(user.id)) {
      if (userIds.length >= MAX_FLAG_USERS) return { ok: false, error: `Не больше ${MAX_FLAG_USERS} пользователей` };
      userIds = [...userIds, user.id];
    }
  }
  if (p.removeUserId) userIds = userIds.filter((id) => id !== p.removeUserId);

  const data = {
    ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
    ...(p.percent !== undefined ? { percent: p.percent } : {}),
    userIds,
    updatedBy: admin.login,
  };
  await db.featureFlag.upsert({ where: { key }, create: { key, ...data }, update: data });
  invalidateFlags();
  console.info(`[flags] ${admin.login}: ${key} ${JSON.stringify(p)}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Строка флага, которого уже нет в реестре (удалён из кода). */
export async function deleteStaleFlagAction(key: string): Promise<void> {
  const admin = await requireAdmin();
  if (isFlagKey(key)) return;
  await db.featureFlag.deleteMany({ where: { key } });
  invalidateFlags();
  console.info(`[flags] ${admin.login}: deleted stale ${key}`);
  revalidatePath("/admin/flags");
}

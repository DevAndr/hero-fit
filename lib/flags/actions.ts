"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { isFlagKey } from "@/lib/flags/registry";
import { flagPatchSchema, MAX_FLAG_USERS, pickFlagUser } from "@/lib/flags/schema";
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

  // Кого добавить — до транзакции (поиск по логину и нику не держит блокировку)
  let addId: string | null = null;
  if (p.addUser) {
    const q = p.addUser;
    // Сначала точный логин, потом ник: у одного может быть логин «bob», у другого — ник «Bob»
    const [byLogin, byNickname] = await Promise.all([
      db.user.findFirst({ where: { login: { equals: q, mode: "insensitive" } }, select: { id: true } }),
      db.user.findFirst({ where: { nicknameKey: nicknameKey(q) }, select: { id: true } }),
    ]);
    addId = pickFlagUser(byLogin, byNickname);
    if (!addId) return { ok: false, error: "Пользователь не найден" };
  }

  // Список меняется под блокировкой строки: два одновременных сохранения не затрут добавленных друг другом
  const error = await db.$transaction(async (tx) => {
    await tx.featureFlag.upsert({ where: { key }, create: { key }, update: {} });
    const [current] = await tx.$queryRaw<{ userIds: string[] }[]>`SELECT "userIds" FROM "FeatureFlag" WHERE key = ${key} FOR UPDATE`;
    let userIds = current.userIds;
    if (addId && !userIds.includes(addId)) {
      if (userIds.length >= MAX_FLAG_USERS) return `Не больше ${MAX_FLAG_USERS} пользователей`;
      userIds = [...userIds, addId];
    }
    if (p.removeUserId) userIds = userIds.filter((id) => id !== p.removeUserId);
    await tx.featureFlag.update({
      where: { key },
      data: {
        ...(p.enabled !== undefined ? { enabled: p.enabled } : {}),
        ...(p.percent !== undefined ? { percent: p.percent } : {}),
        userIds,
        updatedBy: admin.login,
      },
    });
    return null;
  });
  if (error) return { ok: false, error };
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

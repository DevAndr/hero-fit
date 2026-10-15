import "server-only";
import { db } from "@/lib/db";
import { fingerprint } from "@/lib/errors/fingerprint";
import { MESSAGE_MAX, PATH_MAX, STACK_MAX, type ErrorInput } from "@/lib/errors/schema";

export const MAX_EVENTS_PER_GROUP = 50;
export const RETENTION_DAYS = 30;

export type Recorded = { groupId: string; isNew: boolean; reopened: boolean; alertedAt: Date | null };

const cut = (s: string | null, max: number) => (s && s.length > max ? s.slice(0, max) : s);

/**
 * Запись ошибки в группу по отпечатку: счётчик, последнее появление, событие (хранятся последние 50), число
 * пользователей. У решённой группы — снова открыта (`reopened`). `canCreate` — можно ли создать новую группу.
 * Никогда не бросает: сбой — `console.error` и null.
 */
export async function recordError(
  input: ErrorInput,
  now = new Date(),
  { canCreate }: { canCreate?: () => boolean } = {},
): Promise<Recorded | null> {
  try {
    const message = cut(input.message, MESSAGE_MAX) ?? "";
    const stack = cut(input.stack, STACK_MAX);
    const path = cut(input.path, PATH_MAX);
    const key = fingerprint({ source: input.source, message, stack });
    return await db.$transaction(async (tx) => {
      const existing = await tx.errorGroup.findUnique({ where: { fingerprint: key }, select: { resolvedAt: true } });
      // Лимит новых групп (браузер): существующие считаются всегда, новые — пока есть квота
      if (!existing && canCreate && !canCreate()) return null;
      const group = await tx.errorGroup.upsert({
        where: { fingerprint: key },
        create: { fingerprint: key, source: input.source, message, stack, path, version: input.version, count: 1, firstSeen: now, lastSeen: now },
        update: { count: { increment: 1 }, lastSeen: now, path, version: input.version, resolvedAt: null },
        select: { id: true, alertedAt: true },
      });
      await tx.errorEvent.create({
        data: { groupId: group.id, at: now, path, userAgent: cut(input.userAgent, 300), version: input.version, userId: input.userId },
      });
      await tx.$executeRaw`
        DELETE FROM "ErrorEvent" WHERE "groupId" = ${group.id} AND id NOT IN (
          SELECT id FROM "ErrorEvent" WHERE "groupId" = ${group.id} ORDER BY at DESC LIMIT ${MAX_EVENTS_PER_GROUP})`;
      await tx.$executeRaw`
        UPDATE "ErrorGroup" SET users = (SELECT count(DISTINCT "userId")::int FROM "ErrorEvent" WHERE "groupId" = ${group.id})
        WHERE id = ${group.id}`;
      return { groupId: group.id, isNew: !existing, reopened: Boolean(existing?.resolvedAt), alertedAt: group.alertedAt };
    });
  } catch (e) {
    console.error("[errors] record failed", e, input.message);
    return null;
  }
}

/** Срок хранения: события старше 30 дней и группы без событий, не появлявшиеся 30 дней. */
export async function pruneErrors(now: Date) {
  const before = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  await db.errorEvent.deleteMany({ where: { at: { lt: before } } });
  await db.errorGroup.deleteMany({ where: { lastSeen: { lt: before }, events: { none: {} } } });
}

import "server-only";
import { db } from "@/lib/db";
import { planEdit, type PlanOp, type PlanTarget } from "@/lib/plans/edit";
import { getOccurrence } from "@/lib/plans/queries";

/**
 * Изменения планов от имени userId — только для серверного кода (actions проверяют пользователя сами).
 * Не в файле "use server": иначе функции с userId стали бы вызываемыми с клиента.
 */

/** Цель правки по ключу вхождения: разовая запись или вхождение серии. */
export async function planTarget(userId: string, key: string): Promise<PlanTarget | null> {
  const found = await getOccurrence(userId, key);
  if (!found) return null;
  if (!found.series) return { kind: "entry", entryId: found.occurrence.key.slice(2) };
  return { kind: "series", series: found.series, originalDate: key.slice(-10), occurrence: found.occurrence };
}

export async function applyPlanOps(userId: string, ops: PlanOp[]) {
  await db.$transaction(async (tx) => {
    for (const o of ops) {
      switch (o.op) {
        case "upsertException":
          await tx.planEntry.upsert({
            where: { seriesId_originalDate: { seriesId: o.seriesId, originalDate: o.originalDate } },
            create: { userId, seriesId: o.seriesId, originalDate: o.originalDate, cancelled: o.cancelled, ...o.data },
            update: { cancelled: o.cancelled, ...o.data },
          });
          break;
        case "endSeries":
          await tx.planSeries.updateMany({ where: { id: o.seriesId, userId }, data: { endDate: o.endDate } });
          break;
        case "deleteSeries":
          await tx.planSeries.deleteMany({ where: { id: o.seriesId, userId } });
          break;
        case "deleteExceptionsFrom":
          await tx.planEntry.deleteMany({ where: { seriesId: o.seriesId, userId, originalDate: { gte: o.fromDate } } });
          break;
        case "createSeries":
          await tx.planSeries.create({ data: { userId, ...o.data } });
          break;
        case "updateEntry":
          await tx.planEntry.updateMany({ where: { id: o.entryId, userId, seriesId: null }, data: o.data });
          break;
        case "deleteEntry":
          await tx.planEntry.deleteMany({ where: { id: o.entryId, userId, seriesId: null } });
          break;
        case "cancelEntry":
          await tx.planEntry.updateMany({ where: { id: o.entryId, userId, seriesId: null }, data: { cancelled: true } });
          break;
      }
    }
  });
}

/**
 * Пропустить одно вхождение (разовое — удаляется, от тренера — отменяется; у серии — отменённое исключение на этот день).
 * false — не найдено.
 */
export async function skipOccurrence(userId: string, key: string): Promise<boolean> {
  const found = await getOccurrence(userId, key);
  if (!found) return false;
  const t = await planTarget(userId, key);
  if (!t) return false;
  const ops = t.kind === "entry" && found.occurrence.coachId ? [{ op: "cancelEntry" as const, entryId: t.entryId }] : planEdit(t, "one", null);
  await applyPlanOps(userId, ops);
  return true;
}

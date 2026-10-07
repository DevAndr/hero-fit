"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { planEdit, type PlanOp, type PlanScope, type PlanTarget } from "@/lib/plans/edit";
import { addDays, weekdayOf } from "@/lib/plans/expand";
import { getOccurrence } from "@/lib/plans/queries";
import { planInputSchema, planPatchSchema, planScopeSchema, type PlanInput } from "@/lib/plans/schema";

type Result = { ok: true } | { ok: false; error: string };

/** Шаблон доступен пользователю: свой или встроенный. */
async function templateAllowed(userId: string, templateId: string | null | undefined) {
  if (!templateId) return true;
  return (await db.workoutTemplate.count({ where: { id: templateId, OR: [{ userId }, { userId: null }] } })) > 0;
}

function revalidate() {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/training");
}

/** Разовая тренировка (пустой repeatWeekdays) или серии — по одной на каждый выбранный день недели. */
export async function createPlanAction(input: PlanInput): Promise<Result> {
  const user = await requireUser();
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { repeatWeekdays, date, ...plan } = parsed.data;
  if (!(await templateAllowed(user.id, plan.templateId))) return { ok: false, error: "Шаблон не найден" };

  if (!repeatWeekdays.length) {
    await db.planEntry.create({ data: { userId: user.id, date, ...plan } });
  } else {
    // Первое вхождение каждой серии — ближайший такой день, начиная с выбранной даты
    await db.planSeries.createMany({
      data: repeatWeekdays.map((weekday) => ({
        userId: user.id,
        weekday,
        startDate: addDays(date, (weekday - weekdayOf(date) + 7) % 7),
        ...plan,
      })),
    });
  }
  revalidate();
  return { ok: true };
}

async function target(userId: string, key: string): Promise<PlanTarget | null> {
  const found = await getOccurrence(userId, key);
  if (!found) return null;
  if (!found.series) return { kind: "entry", entryId: found.occurrence.key.slice(2) };
  return { kind: "series", series: found.series, originalDate: key.slice(-10), occurrence: found.occurrence };
}

async function apply(userId: string, ops: PlanOp[]) {
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
      }
    }
  });
}

/** Правка или перенос (перетаскивание): scope — «только это» / «это и следующие». */
export async function updatePlanAction(key: string, scope: PlanScope, patch: unknown): Promise<Result> {
  const user = await requireUser();
  const parsedPatch = planPatchSchema.safeParse(patch);
  const parsedScope = planScopeSchema.safeParse(scope);
  if (!parsedPatch.success || !parsedScope.success) return { ok: false, error: "Проверьте поля" };
  if (!(await templateAllowed(user.id, parsedPatch.data.templateId))) return { ok: false, error: "Шаблон не найден" };
  const t = await target(user.id, key);
  if (!t) return { ok: false, error: "Тренировка в календаре не найдена" };
  await apply(user.id, planEdit(t, parsedScope.data, parsedPatch.data));
  revalidate();
  return { ok: true };
}

export async function deletePlanAction(key: string, scope: PlanScope): Promise<Result> {
  const user = await requireUser();
  const parsedScope = planScopeSchema.safeParse(scope);
  if (!parsedScope.success) return { ok: false, error: "Проверьте поля" };
  const t = await target(user.id, key);
  if (!t) return { ok: false, error: "Тренировка в календаре не найдена" };
  await apply(user.id, planEdit(t, parsedScope.data, null));
  revalidate();
  return { ok: true };
}

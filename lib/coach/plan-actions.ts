"use server";

import { revalidatePath } from "next/cache";
import { NotificationType } from "@/generated/prisma/enums";
import { queueGoal } from "@/lib/analytics/queue";
import { requireClientOf } from "@/lib/coach/access";
import { assignInputSchema, assignmentText, type AssignInput } from "@/lib/coach/assign";
import { db } from "@/lib/db";
import { notify } from "@/lib/notifications/service";
import { planEdit, type PlanScope } from "@/lib/plans/edit";
import { addDays, weekdayOf } from "@/lib/plans/expand";
import { applyPlanOps, planTarget } from "@/lib/plans/mutations";
import { getOccurrence } from "@/lib/plans/queries";
import { planPatchSchema, planScopeSchema } from "@/lib/plans/schema";

type Result = { ok: true } | { ok: false; error: string };

const NOT_FOUND = "Тренировка в календаре не найдена";

/** Шаблон тренера — только свой (не встроенный и не чужой). */
async function coachTemplate(coachId: string, templateId: string) {
  return db.workoutTemplate.findFirst({ where: { id: templateId, userId: coachId }, select: { id: true, name: true } });
}

function revalidate(clientId: string) {
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach");
}

/** Назначить свой шаблон клиенту: разово (пустой repeatWeekdays) или серией на каждый выбранный день недели. */
export async function assignWorkoutAction(clientId: string, input: AssignInput): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { repeatWeekdays, date, endDate, templateId, time, durationMin } = parsed.data;
  const template = await coachTemplate(coach.id, templateId);
  if (!template) return { ok: false, error: "Шаблон не найден" };
  const plan = { templateId, title: template.name, time, durationMin, coachId: coach.id };

  // Первая дата назначения — для ссылки в уведомлении
  const starts = repeatWeekdays.map((weekday) => addDays(date, (weekday - weekdayOf(date) + 7) % 7));
  const first = starts.length ? starts.toSorted()[0] : date;
  await db.$transaction(async (tx) => {
    if (!repeatWeekdays.length) await tx.planEntry.create({ data: { userId: clientId, date, ...plan } });
    else
      await tx.planSeries.createMany({
        data: repeatWeekdays.map((weekday, i) => ({ userId: clientId, weekday, startDate: starts[i], endDate, ...plan })),
      });
    await notify(
      tx,
      clientId,
      {
        type: NotificationType.COACH,
        title: "Новый план от тренера",
        body: assignmentText({ templateName: template.name, date, weekdays: repeatWeekdays }),
        url: `/calendar?date=${first}`,
      },
      { push: true },
    );
  });
  await queueGoal("coach_assign");
  revalidate(clientId);
  return { ok: true };
}

/** Вхождение назначено именно этим тренером — иначе тренер его не трогает. */
async function ownTarget(coachId: string, clientId: string, key: string) {
  const found = await getOccurrence(clientId, String(key));
  if (!found || found.occurrence.coachId !== coachId) return null;
  return planTarget(clientId, String(key));
}

export async function updateAssignmentAction(clientId: string, key: string, scope: PlanScope, patch: unknown): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsedPatch = planPatchSchema.safeParse(patch);
  const parsedScope = planScopeSchema.safeParse(scope);
  if (!parsedPatch.success || !parsedScope.success) return { ok: false, error: "Проверьте поля" };
  const data = { ...parsedPatch.data };
  if (data.templateId) {
    const template = await coachTemplate(coach.id, data.templateId);
    if (!template) return { ok: false, error: "Шаблон не найден" };
    data.title = template.name;
  } else if (data.templateId === null) return { ok: false, error: "Выберите шаблон" };
  const t = await ownTarget(coach.id, clientId, key);
  if (!t) return { ok: false, error: NOT_FOUND };
  await applyPlanOps(clientId, planEdit(t, parsedScope.data, data));
  revalidate(clientId);
  return { ok: true };
}

export async function deleteAssignmentAction(clientId: string, key: string, scope: PlanScope): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsedScope = planScopeSchema.safeParse(scope);
  if (!parsedScope.success) return { ok: false, error: "Проверьте поля" };
  const t = await ownTarget(coach.id, clientId, key);
  if (!t) return { ok: false, error: NOT_FOUND };
  await applyPlanOps(clientId, planEdit(t, parsedScope.data, null));
  // «Только эту» у серии — отменённое исключение; помечаем тренером, чтобы не путать с пропуском клиента
  if (t.kind === "series" && parsedScope.data === "one")
    await db.planEntry.updateMany({ where: { userId: clientId, seriesId: t.series.id, originalDate: t.originalDate }, data: { coachId: coach.id } });
  revalidate(clientId);
  return { ok: true };
}

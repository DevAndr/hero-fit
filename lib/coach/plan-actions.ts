"use server";

import { revalidatePath } from "next/cache";
import { NotificationType } from "@/generated/prisma/enums";
import { queueGoal } from "@/lib/analytics/queue";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { requireClientOf, requireCoach } from "@/lib/coach/access";
import { ASSIGN_MANY_MAX, assignInputSchema, assignmentText, pickClients, type AssignInput } from "@/lib/coach/assign";
import { copyPlan, copySummary } from "@/lib/coach/plan-copy";
import { getPlanCopySource } from "@/lib/coach/plan-copy-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
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

type Assignment = { template: { id: string; name: string }; input: z.output<typeof assignInputSchema> };

/** Назначение одному клиенту внутри транзакции: разовая запись или серии + уведомление клиенту. */
async function assignToClient(tx: Prisma.TransactionClient, coachId: string, clientId: string, { template, input }: Assignment) {
  const { repeatWeekdays, date, endDate, time, durationMin } = input;
  const plan = { templateId: template.id, title: template.name, time, durationMin, coachId };
  // Первая дата назначения — для ссылки в уведомлении
  const starts = repeatWeekdays.map((weekday) => addDays(date, (weekday - weekdayOf(date) + 7) % 7));
  const first = starts.length ? starts.toSorted()[0] : date;
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
}

/** Назначить свой шаблон клиенту: разово (пустой repeatWeekdays) или серией на каждый выбранный день недели. */
export async function assignWorkoutAction(clientId: string, input: AssignInput): Promise<Result> {
  const { coach } = await requireClientOf(String(clientId));
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const template = await coachTemplate(coach.id, parsed.data.templateId);
  if (!template) return { ok: false, error: "Шаблон не найден" };
  await db.$transaction((tx) => assignToClient(tx, coach.id, clientId, { template, input: parsed.data }));
  await queueGoal("coach_assign");
  revalidate(clientId);
  return { ok: true };
}

const clientIdsSchema = z
  .array(z.string().min(1))
  .min(1, "Выберите клиентов")
  .max(ASSIGN_MANY_MAX, `Не больше ${ASSIGN_MANY_MAX} клиентов за раз`);

/**
 * Тот же шаблон и расписание — сразу нескольким клиентам: у каждого своё независимое назначение (как из карточки).
 * Только активные клиенты этого тренера; остальные id пропускаются и считаются.
 */
export async function assignManyAction(
  clientIds: string[],
  input: AssignInput,
): Promise<{ ok: true; assigned: number; skipped: number } | { ok: false; error: string }> {
  const coach = await requireCoach();
  const ids = clientIdsSchema.safeParse(clientIds);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Выберите клиентов" };
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const template = await coachTemplate(coach.id, parsed.data.templateId);
  if (!template) return { ok: false, error: "Шаблон не найден" };

  const links = await db.coachLink.findMany({ where: { coachId: coach.id, endedAt: null }, select: { clientId: true } });
  const { ids: chosen, skipped } = pickClients(ids.data, links.map((l) => l.clientId));
  if (!chosen.length) return { ok: false, error: "Клиенты не найдены" };

  await db.$transaction(
    async (tx) => {
      // По очереди: у транзакции одно соединение
      for (const clientId of chosen) await assignToClient(tx, coach.id, clientId, { template, input: parsed.data });
    },
    // До 50 клиентов по 3–4 запроса — стандартных 5 с может не хватить
    { timeout: 30_000 },
  );
  await queueGoal("coach_assign");
  for (const clientId of chosen) revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach");
  return { ok: true, assigned: chosen.length, skipped };
}

/**
 * Копировать план клиента (будущие назначения тренера и задания по их шаблонам) другим своим клиентам. Добавляется
 * рядом с их планом; задания по тем же шаблону и упражнению перезаписываются, счётчик неудач — с нуля.
 */
export async function copyPlanAction(
  sourceId: string,
  clientIds: string[],
  opts: { withWeights: boolean },
): Promise<{ ok: true; copied: number; skipped: number } | { ok: false; error: string }> {
  const { client: source, coach } = await requireClientOf(String(sourceId));
  const ids = clientIdsSchema.safeParse(clientIds);
  if (!ids.success) return { ok: false, error: ids.error.issues[0]?.message ?? "Выберите клиентов" };
  const today = dayKey(new Date(), safeTimeZone(source.timeZone));
  const plan = copyPlan(await getPlanCopySource(coach.id, source.id), today, { withWeights: opts?.withWeights === true });
  const summary = copySummary(plan);
  if (!summary) return { ok: false, error: "Нечего копировать" };

  const links = await db.coachLink.findMany({
    where: { coachId: coach.id, endedAt: null, clientId: { not: source.id } },
    select: { clientId: true },
  });
  const { ids: chosen, skipped } = pickClients(ids.data, links.map((l) => l.clientId));
  if (!chosen.length) return { ok: false, error: "Клиенты не найдены" };

  // Ссылка уведомления — на первую скопированную дату
  const first = [...plan.series.map((s) => addDays(s.startDate, (s.weekday - weekdayOf(s.startDate) + 7) % 7)), ...plan.entries.map((e) => e.date)]
    .toSorted()[0] ?? today;
  await db.$transaction(
    async (tx) => {
      // По очереди: у транзакции одно соединение
      for (const clientId of chosen) {
        if (plan.series.length)
          await tx.planSeries.createMany({ data: plan.series.map((s) => ({ ...s, userId: clientId, coachId: coach.id })) });
        if (plan.entries.length)
          await tx.planEntry.createMany({
            data: plan.entries.map(({ cancelled: _, ...e }) => ({ ...e, userId: clientId, coachId: coach.id })),
          });
        for (const { templateId, exerciseId, sets, reps, weight, step } of plan.targets) {
          await tx.coachTarget.upsert({
            where: { clientId_templateId_exerciseId: { clientId, templateId, exerciseId } },
            create: { clientId, templateId, exerciseId, sets, reps, weight, step },
            update: { sets, reps, weight, step, fails: 0, unloadedAt: null },
          });
        }
        await notify(
          tx,
          clientId,
          { type: NotificationType.COACH, title: "Новый план от тренера", body: summary, url: `/calendar?date=${first}` },
          { push: true },
        );
      }
    },
    // До 50 клиентов по нескольку запросов — стандартных 5 с может не хватить
    { timeout: 30_000 },
  );
  await queueGoal("coach_copy_plan");
  for (const clientId of chosen) revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath("/coach");
  revalidatePath("/training");
  return { ok: true, copied: chosen.length, skipped };
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

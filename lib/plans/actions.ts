"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { planEdit, type PlanScope } from "@/lib/plans/edit";
import { addDays, weekdayOf } from "@/lib/plans/expand";
import { applyPlanOps as apply, planTarget as target, skipOccurrence } from "@/lib/plans/mutations";
import { getOccurrence } from "@/lib/plans/queries";
import { planInputSchema, planPatchSchema, planScopeSchema, type PlanInput } from "@/lib/plans/schema";

type Result = { ok: true } | { ok: false; error: string };

/** Шаблон доступен пользователю: свой или встроенный. */
async function templateAllowed(userId: string, templateId: string | null | undefined) {
  if (!templateId) return true;
  return (await db.workoutTemplate.count({ where: { id: templateId, OR: [{ userId }, { userId: null }] } })) > 0;
}

const COACH_PLAN_ERROR = "Назначено тренером — изменить может только он";

/** Назначенное тренером клиент не меняет и не удаляет — только запускает или пропускает. */
async function isCoachPlan(userId: string, key: string) {
  return (await getOccurrence(userId, key))?.occurrence.coachId != null;
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

/** Правка или перенос (перетаскивание): scope — «только это» / «это и следующие». */
export async function updatePlanAction(key: string, scope: PlanScope, patch: unknown): Promise<Result> {
  const user = await requireUser();
  const parsedPatch = planPatchSchema.safeParse(patch);
  const parsedScope = planScopeSchema.safeParse(scope);
  if (!parsedPatch.success || !parsedScope.success) return { ok: false, error: "Проверьте поля" };
  if (!(await templateAllowed(user.id, parsedPatch.data.templateId))) return { ok: false, error: "Шаблон не найден" };
  if (await isCoachPlan(user.id, key)) return { ok: false, error: COACH_PLAN_ERROR };
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
  if (await isCoachPlan(user.id, key)) return { ok: false, error: COACH_PLAN_ERROR };
  const t = await target(user.id, key);
  if (!t) return { ok: false, error: "Тренировка в календаре не найдена" };
  await apply(user.id, planEdit(t, parsedScope.data, null));
  revalidate();
  return { ok: true };
}

/** «Пропустить» план на сегодня из карточки: только это вхождение (у серии — исключение на этот день). */
export async function skipPlanAction(key: string): Promise<Result> {
  const user = await requireUser();
  if (!(await skipOccurrence(user.id, key))) return { ok: false, error: "Тренировка в календаре не найдена" };
  revalidate();
  return { ok: true };
}

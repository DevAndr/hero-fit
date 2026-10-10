"use server";

import { revalidatePath } from "next/cache";
import { queueGoal } from "@/lib/analytics/queue";
import { requireClientOf } from "@/lib/coach/access";
import { isEmptyTarget, targetsSchema, validateTargetItems } from "@/lib/coach/targets";
import { assignedWhere } from "@/lib/coach/templates";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays } from "@/lib/plans/expand";

type Result = { ok: true } | { ok: false; error: string };

/** Задания клиенту по назначенному шаблону: пустая строка удаляет задание, остальные — upsert. */
export async function saveTargetsAction(
  clientId: string,
  templateId: string,
  items: { exerciseId: string; sets: number | null; reps: number | null; weight: number | null }[],
): Promise<Result> {
  const { client, coach } = await requireClientOf(String(clientId));
  const parsed = targetsSchema.safeParse(items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте числа" };
  const since = addDays(dayKey(new Date(), safeTimeZone(client.timeZone)), -1);
  const template = await db.workoutTemplate.findFirst({
    where: { id: String(templateId), ...assignedWhere(client.id, coach.id, since) },
    select: { id: true, exercises: { select: { exerciseId: true } } },
  });
  if (!template) return { ok: false, error: "Шаблон не назначен клиенту" };
  if (!validateTargetItems(parsed.data, template.exercises.map((e) => e.exerciseId))) return { ok: false, error: "Упражнения нет в шаблоне" };

  const key = { clientId: client.id, templateId: template.id };
  const empty = parsed.data.filter(isEmptyTarget).map((t) => t.exerciseId);
  const filled = parsed.data.filter((t) => !isEmptyTarget(t));
  const before = await db.$transaction(async (tx) => {
    const count = await tx.coachTarget.count({ where: key });
    if (empty.length) await tx.coachTarget.deleteMany({ where: { ...key, exerciseId: { in: empty } } });
    for (const { exerciseId, sets, reps, weight } of filled) {
      await tx.coachTarget.upsert({
        where: { clientId_templateId_exerciseId: { ...key, exerciseId } },
        create: { ...key, exerciseId, sets, reps, weight },
        update: { sets, reps, weight },
      });
    }
    return count;
  });
  if (!before && filled.length) await queueGoal("coach_targets");
  revalidatePath(`/coach/clients/${client.id}`);
  revalidatePath("/training");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { queueGoal } from "@/lib/analytics/queue";
import { requireClientOf, requireCoach } from "@/lib/coach/access";
import { assignProgramSchema, PROGRAMS_MAX, programSchema, programWeekIndex, type AssignProgramInput, type ProgramInput } from "@/lib/coach/program";
import { assignProgram, endAssignment } from "@/lib/coach/program-assign";
import { getActiveAssignment, getCoachPrograms } from "@/lib/coach/program-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { addDays, weekdayOf } from "@/lib/dates";
import { getLastPerformance } from "@/lib/workouts/queries";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";

type Result = { ok: true } | { ok: false; error: string };

const UNAVAILABLE = "Программы недоступны";
const NOT_FOUND = "Программа не найдена";

async function programCoach() {
  const coach = await requireCoach();
  return (await isEnabled("coach_programs", coach.id)) ? coach : null;
}

/** Создать (id = null) или изменить программу; дни заменяются целиком. Шаблоны — только свои. */
export async function saveProgramAction(id: string | null, input: ProgramInput): Promise<Result> {
  const coach = await programCoach();
  if (!coach) return { ok: false, error: UNAVAILABLE };
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const { days, ...data } = parsed.data;
  const templateIds = [...new Set(days.map((d) => d.templateId))];
  if ((await db.workoutTemplate.count({ where: { id: { in: templateIds }, userId: coach.id } })) !== templateIds.length)
    return { ok: false, error: "Шаблон не найден" };

  const error = await db.$transaction(async (tx) => {
    let programId: string;
    if (id === null) {
      if ((await tx.coachProgram.count({ where: { coachId: coach.id } })) >= PROGRAMS_MAX) return `Не больше ${PROGRAMS_MAX} программ`;
      programId = (await tx.coachProgram.create({ data: { ...data, coachId: coach.id }, select: { id: true } })).id;
    } else {
      const { count } = await tx.coachProgram.updateMany({ where: { id: String(id), coachId: coach.id }, data });
      if (!count) return NOT_FOUND;
      programId = String(id);
      await tx.coachProgramDay.deleteMany({ where: { programId } });
    }
    await tx.coachProgramDay.createMany({ data: days.map((d) => ({ ...d, programId })) });
    return null;
  });
  if (error) return { ok: false, error };
  revalidatePath("/coach/programs");
  return { ok: true };
}

/** Удалить программу из библиотеки; назначенные клиентам остаются (снимок). */
export async function deleteProgramAction(id: string): Promise<Result> {
  const coach = await programCoach();
  if (!coach) return { ok: false, error: UNAVAILABLE };
  const { count } = await db.coachProgram.deleteMany({ where: { id: String(id), coachId: coach.id } });
  if (!count) return { ok: false, error: NOT_FOUND };
  revalidatePath("/coach/programs");
  return { ok: true };
}

async function clientProgramCoach(clientId: string) {
  const access = await requireClientOf(String(clientId));
  return (await isEnabled("coach_programs", access.coach.id)) ? access : null;
}

const todayOf = (tz: string) => dayKey(new Date(), safeTimeZone(tz));

/** Базы для диалога назначения: силовые упражнения шаблонов программы; вес — задание → последний рабочий → шаблон → 0. */
export async function getProgramBasesAction(
  clientId: string,
  programId: string,
): Promise<{ ok: true; bases: { templateId: string; templateName: string; exerciseId: string; exerciseName: string; weight: number }[] } | { ok: false; error: string }> {
  const access = await clientProgramCoach(clientId);
  if (!access) return { ok: false, error: UNAVAILABLE };
  const program = (await getCoachPrograms(access.coach.id)).find((p) => p.id === String(programId));
  if (!program) return { ok: false, error: NOT_FOUND };
  const templateIds = [...new Set(program.days.map((d) => d.templateId))];
  const rows = await db.templateExercise.findMany({
    where: { templateId: { in: templateIds }, exercise: { kind: "REPS" } },
    orderBy: [{ templateId: "asc" }, { order: "asc" }],
    select: { templateId: true, exerciseId: true, targetWeight: true, template: { select: { name: true } }, exercise: { select: { name: true } } },
  });
  const [targets, last] = await Promise.all([
    db.coachTarget.findMany({ where: { clientId, templateId: { in: templateIds } }, select: { templateId: true, exerciseId: true, weight: true } }),
    getLastPerformance(clientId, [...new Set(rows.map((r) => r.exerciseId))]),
  ]);
  const seen = new Set<string>();
  const bases = rows.flatMap((r) => {
    const key = `${r.templateId}:${r.exerciseId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const target = targets.find((t) => t.templateId === r.templateId && t.exerciseId === r.exerciseId)?.weight;
    const lastWeight = Math.max(0, ...(last[r.exerciseId]?.sets.map((s) => s.weight) ?? []));
    return [{ templateId: r.templateId, templateName: r.template.name, exerciseId: r.exerciseId, exerciseName: r.exercise.name, weight: target ?? (lastWeight || (r.targetWeight ?? 0)) }];
  });
  return { ok: true, bases };
}

/** Назначить программу клиенту; прежняя активная закрывается. Две вкладки не оставят двух активных — строка клиента под FOR UPDATE. */
export async function assignProgramAction(clientId: string, input: AssignProgramInput): Promise<Result> {
  const access = await clientProgramCoach(clientId);
  if (!access) return { ok: false, error: UNAVAILABLE };
  const parsed = assignProgramSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте поля" };
  const today = todayOf(access.client.timeZone);
  if (parsed.data.startDate < addDays(today, -weekdayOf(today))) return { ok: false, error: "Старт — не раньше текущей недели" };
  const program = (await getCoachPrograms(access.coach.id)).find((p) => p.id === parsed.data.programId);
  if (!program) return { ok: false, error: NOT_FOUND };
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${access.client.id} FOR UPDATE`;
    await assignProgram(tx, access.coach.id, access.client.id, program, parsed.data, today);
  });
  await queueGoal("coach_program_assign");
  revalidatePath(`/coach/clients/${access.client.id}`);
  revalidatePath("/coach");
  return { ok: true };
}

/** Завершить программу клиента досрочно: вес последней прошедшей обычной недели — в задания. */
export async function endProgramAction(clientId: string): Promise<Result> {
  const access = await clientProgramCoach(clientId);
  if (!access) return { ok: false, error: UNAVAILABLE };
  const today = todayOf(access.client.timeZone);
  const active = await getActiveAssignment(access.client.id, today);
  if (!active || active.coachId !== access.coach.id) return { ok: false, error: NOT_FOUND };
  await db.$transaction((tx) => endAssignment(tx, active.id, today, { writeTargets: true }));
  revalidatePath(`/coach/clients/${access.client.id}`);
  revalidatePath("/coach");
  return { ok: true };
}

/** «Изменить базу»: новые базы действуют с текущей недели (рост — заново от них). */
export async function updateBasesAction(clientId: string, bases: { templateId: string; exerciseId: string; weight: number }[]): Promise<Result> {
  const access = await clientProgramCoach(clientId);
  if (!access) return { ok: false, error: UNAVAILABLE };
  const parsed = assignProgramSchema.shape.bases.safeParse(bases);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте вес" };
  const today = todayOf(access.client.timeZone);
  const active = await getActiveAssignment(access.client.id, today);
  if (!active || active.coachId !== access.coach.id) return { ok: false, error: NOT_FOUND };
  const fromWeek = Math.max(1, programWeekIndex(active.startDate, today) ?? 1);
  await db.$transaction(async (tx) => {
    for (const b of parsed.data) {
      const current = active.bases.find((x) => x.templateId === b.templateId && x.exerciseId === b.exerciseId);
      if (!current || (current.weight === b.weight && current.fromWeek === fromWeek)) continue;
      await tx.programBase.update({
        where: { assignmentId_templateId_exerciseId: { assignmentId: active.id, templateId: b.templateId, exerciseId: b.exerciseId } },
        data: { weight: b.weight, fromWeek },
      });
    }
  });
  revalidatePath(`/coach/clients/${access.client.id}`);
  return { ok: true };
}

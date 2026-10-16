import "server-only";
import { applyProgramToTargets, isDeloadWeek, programEndDay, programLabel, programWeekIndex, type ProgramRule } from "@/lib/coach/program";
import { endAssignment, ruleOfAssignment } from "@/lib/coach/program-assign";
import type { Target } from "@/lib/coach/targets";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { isEnabled } from "@/lib/flags/server";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";

export type ProgramView = {
  id: string;
  name: string;
  rule: ProgramRule;
  days: { weekday: number; templateId: string; templateName: string; time: string; durationMin: number }[];
};

const ruleOf = (p: { weeks: number; stepKind: "PERCENT" | "KG"; stepValue: number; deloadEvery: number | null; deloadPct: number }): ProgramRule => ({
  weeks: p.weeks,
  stepKind: p.stepKind,
  stepValue: p.stepValue,
  deloadEvery: p.deloadEvery,
  deloadPct: p.deloadPct,
});

/** Библиотека программ тренера (новые сверху). */
export async function getCoachPrograms(coachId: string): Promise<ProgramView[]> {
  const rows = await db.coachProgram.findMany({
    where: { coachId },
    orderBy: { createdAt: "desc" },
    include: { days: { orderBy: { weekday: "asc" }, include: { template: { select: { name: true } } } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    rule: ruleOf(p),
    days: p.days.map((d) => ({ weekday: d.weekday, templateId: d.templateId, templateName: d.template.name, time: d.time, durationMin: d.durationMin })),
  }));
}

/** Активное назначение клиента: не закрыто и срок не кончился (день — в поясе клиента). */
export async function getActiveAssignment(clientId: string, today: string) {
  const rows = await db.programAssignment.findMany({
    where: { clientId, endedAt: null, startDate: { lte: addDays(today, 7 * 16) } },
    orderBy: { createdAt: "desc" },
    include: { bases: true },
  });
  return rows.find((a) => programEndDay(a.startDate, a.weeks) >= today) ?? null;
}
export type ActiveAssignment = NonNullable<Awaited<ReturnType<typeof getActiveAssignment>>>;

/**
 * Программа поверх заданий клиента по шаблону (getTemplateTargets): флаг — у тренера назначения; программа
 * активна, шаблон — в её сериях, день в пределах недель. Кончился срок — ленивое окончание: вес последней обычной
 * недели переходит в задания (один раз, условно по endedAt).
 */
export async function programForTemplate(
  clientId: string,
  templateId: string,
  day: string | undefined,
): Promise<{ ended: boolean; overlay: ((targets: Map<string, Target>) => Map<string, Target & { program?: string }>) | null }> {
  const assignment = await db.programAssignment.findFirst({
    where: { clientId, endedAt: null, series: { some: { templateId } } },
    orderBy: { createdAt: "desc" },
    include: { bases: { where: { templateId } }, client: { select: { timeZone: true } } },
  });
  if (!assignment?.coachId || !(await isEnabled("coach_programs", assignment.coachId))) return { ended: false, overlay: null };
  const today = day ?? dayKey(new Date(), safeTimeZone(assignment.client.timeZone));
  const week = programWeekIndex(assignment.startDate, today);
  const rule = ruleOfAssignment(assignment);
  if (week !== null && week > rule.weeks) {
    await db.$transaction((tx) => endAssignment(tx, assignment.id, today, { writeTargets: true, lastWeek: rule.weeks }));
    return { ended: true, overlay: null };
  }
  if (week === null || !assignment.bases.length) return { ended: false, overlay: null };
  const rows = await db.templateExercise.findMany({ where: { templateId }, select: { exerciseId: true, targetSets: true } });
  const templateSets = new Map(rows.map((r) => [r.exerciseId, r.targetSets]));
  return { ended: false, overlay: (targets) => applyProgramToTargets(targets, templateSets, assignment.bases, rule, week) };
}

/** Метки недель программы для вхождений календаря: (seriesId, дата) → «Неделя 3/8» / «Разгрузка · неделя 4/8». */
export async function programWeekLabels(seriesIds: (string | null)[]): Promise<(seriesId: string | null, date: string) => string | null> {
  const ids = [...new Set(seriesIds.filter((id): id is string => id !== null))];
  const rows = ids.length
    ? await db.planSeries.findMany({
        where: { id: { in: ids }, programAssignmentId: { not: null } },
        select: { id: true, programAssignment: { select: { startDate: true, weeks: true, deloadEvery: true, coachId: true } } },
      })
    : [];
  const coaches = [...new Set(rows.map((r) => r.programAssignment?.coachId).filter((id): id is string => Boolean(id)))];
  const on = new Set<string>();
  for (const id of coaches) if (await isEnabled("coach_programs", id)) on.add(id);
  const bySeries = new Map(rows.flatMap((r) => (r.programAssignment?.coachId && on.has(r.programAssignment.coachId) ? [[r.id, r.programAssignment] as const] : [])));
  return (seriesId, date) => {
    const a = seriesId ? bySeries.get(seriesId) : undefined;
    if (!a) return null;
    const week = programWeekIndex(a.startDate, date);
    return week !== null && week <= a.weeks ? programLabel(week, a.weeks, isDeloadWeek(week, a.deloadEvery)) : null;
  };
}

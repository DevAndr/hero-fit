import "server-only";
import { applyProgramToTargets, isDeloadWeek, programEndDay, programLabel, programWeekIndex, type ProgramRule } from "@/lib/coach/program";
import { endAssignment, ruleOfAssignment } from "@/lib/coach/program-assign";
import type { Target } from "@/lib/coach/targets";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { participants } from "@/lib/catalog/queries";
import { catalogSourceLabel } from "@/lib/catalog/rules";
import { db } from "@/lib/db";

export type ProgramView = {
  id: string;
  name: string;
  rule: ProgramRule;
  days: { weekday: number; templateId: string; templateName: string; time: string; durationMin: number }[];
  /** Каталог программ: опубликована ли, описание, снятие администратором. */
  catalog: { published: boolean; description: string; hiddenReason: string | null; hidden: boolean };
  /** Активных запусков из каталога (всегда 0 без публикации). */
  participants: number;
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
  const counts = await participants(rows.map((p) => p.id));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    rule: ruleOf(p),
    catalog: { published: p.publishedAt !== null, description: p.catalogDescription ?? "", hiddenReason: p.hiddenReason, hidden: p.hiddenAt !== null },
    participants: counts.get(p.id) ?? 0,
    days: p.days.map((d) => ({ weekday: d.weekday, templateId: d.templateId, templateName: d.template.name, time: d.time, durationMin: d.durationMin })),
  }));
}

/** Активное назначение клиента: не закрыто и срок не кончился (день — в поясе клиента). */
export async function getActiveAssignment(clientId: string, today: string, coachId?: string) {
  const rows = await db.programAssignment.findMany({
    where: { clientId, endedAt: null, ...(coachId ? { coachId } : {}) },
    orderBy: { createdAt: "desc" },
    include: { bases: true },
  });
  const active = rows.find((a) => programEndDay(a.startDate, a.weeks) >= today);
  if (!active) return null;
  const [exercises, templates] = await Promise.all([
    db.exercise.findMany({ where: { id: { in: active.bases.map((b) => b.exerciseId) } }, select: { id: true, name: true } }),
    db.workoutTemplate.findMany({ where: { id: { in: active.bases.map((b) => b.templateId) } }, select: { id: true, name: true } }),
  ]);
  return {
    ...active,
    names: Object.fromEntries(exercises.map((e) => [e.id, e.name])) as Record<string, string>,
    templateNames: Object.fromEntries(templates.map((t) => [t.id, t.name])) as Record<string, string>,
  };
}
export type ActiveAssignment = NonNullable<Awaited<ReturnType<typeof getActiveAssignment>>>;

/**
 * Программа поверх заданий клиента по шаблону (getTemplateTargets): у назначения есть тренер или оно запущено
 * из каталога (catalog — название программы); программа активна, шаблон — в её сериях, день в пределах недель.
 * Кончился срок — ленивое окончание: вес последней обычной недели переходит в задания (один раз, условно по endedAt).
 */
export async function programForTemplate(
  clientId: string,
  templateId: string,
  day: string | undefined,
): Promise<{ ended: boolean; catalog: string | null; overlay: ((targets: Map<string, Target>) => Map<string, Target & { program?: string }>) | null }> {
  const assignment = await db.programAssignment.findFirst({
    where: { clientId, endedAt: null, series: { some: { templateId } } },
    orderBy: { createdAt: "desc" },
    include: { bases: { where: { templateId } }, client: { select: { timeZone: true } } },
  });
  const catalog = assignment && !assignment.coachId && assignment.catalogProgramId ? assignment.name : null;
  if (!assignment || (!assignment.coachId && catalog === null)) return { ended: false, catalog: null, overlay: null };
  const today = day ?? dayKey(new Date(), safeTimeZone(assignment.client.timeZone));
  const week = programWeekIndex(assignment.startDate, today);
  const rule = ruleOfAssignment(assignment);
  if (week !== null && week > rule.weeks) {
    await db.$transaction((tx) => endAssignment(tx, assignment.id, today, { writeTargets: true, lastWeek: rule.weeks }));
    return { ended: true, catalog, overlay: null };
  }
  if (week === null || !assignment.bases.length) return { ended: false, catalog, overlay: null };
  const rows = await db.templateExercise.findMany({ where: { templateId }, select: { exerciseId: true, targetSets: true } });
  const templateSets = new Map(rows.map((r) => [r.exerciseId, r.targetSets]));
  return { ended: false, catalog, overlay: (targets) => applyProgramToTargets(targets, templateSets, assignment.bases, rule, week) };
}

/**
 * Метки недель программы для вхождений календаря: (seriesId, дата) → «Неделя 3/8» / «Разгрузка · неделя 4/8»;
 * программа из каталога — с названием: «программа «Сила» (неделя 3/8)».
 */
export async function programWeekLabels(seriesIds: (string | null)[]): Promise<(seriesId: string | null, date: string) => string | null> {
  const ids = [...new Set(seriesIds.filter((id): id is string => id !== null))];
  const rows = ids.length
    ? await db.planSeries.findMany({
        where: { id: { in: ids }, programAssignmentId: { not: null } },
        select: { id: true, programAssignment: { select: { name: true, startDate: true, weeks: true, deloadEvery: true, coachId: true, catalogProgramId: true } } },
      })
    : [];
  const bySeries = new Map(
    rows.flatMap((r) => (r.programAssignment && (r.programAssignment.coachId || r.programAssignment.catalogProgramId) ? [[r.id, r.programAssignment] as const] : [])),
  );
  return (seriesId, date) => {
    const a = seriesId ? bySeries.get(seriesId) : undefined;
    if (!a) return null;
    const week = programWeekIndex(a.startDate, date);
    if (week === null || week > a.weeks) return null;
    const label = programLabel(week, a.weeks, isDeloadWeek(week, a.deloadEvery));
    return a.coachId ? label : catalogSourceLabel(a.name, label);
  };
}

/** «Нед. 3/8» по клиентам тренера для списка /coach (активные программы этого тренера). */
export async function programBadges(coachId: string, clients: { id: string; timeZone: string }[], now = new Date()): Promise<Record<string, string>> {
  if (!clients.length) return {};
  const rows = await db.programAssignment.findMany({
    where: { coachId, endedAt: null, clientId: { in: clients.map((c) => c.id) } },
    select: { clientId: true, startDate: true, weeks: true },
  });
  const tz = new Map(clients.map((c) => [c.id, c.timeZone]));
  const out: Record<string, string> = {};
  for (const a of rows) {
    const week = programWeekIndex(a.startDate, dayKey(now, safeTimeZone(tz.get(a.clientId) ?? "UTC")));
    if (week !== null && week <= a.weeks) out[a.clientId] = `Нед. ${week}/${a.weeks}`;
  }
  return out;
}

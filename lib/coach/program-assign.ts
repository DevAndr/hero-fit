import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { lastLoadedWeight, programEndDay, programWeekIndex, seriesStarts, type ProgramRule } from "@/lib/coach/program";
import { addDays } from "@/lib/dates";
import { plural } from "@/lib/format";
import { notify } from "@/lib/notifications/service";

type Tx = Prisma.TransactionClient;

const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
const fmt = (day: string) => shortDate.format(new Date(`${day}T12:00:00Z`));

export const ruleOfAssignment = (a: { weeks: number; stepKind: "PERCENT" | "KG"; stepValue: number; deloadEvery: number | null; deloadPct: number }): ProgramRule => ({
  weeks: a.weeks,
  stepKind: a.stepKind,
  stepValue: a.stepValue,
  deloadEvery: a.deloadEvery,
  deloadPct: a.deloadPct,
});

/**
 * Закрыть назначение: endedAt, будущие вхождения серий убираются (не начавшиеся — удаляются), прошедшие тренировки
 * остаются. writeTargets — вес последней обычной недели (до lastWeek) переходит в задания тренера, чтобы клиент не
 * откатился к базе. Условно по endedAt = null: повторный вызов ничего не делает.
 */
export async function endAssignment(tx: Tx, assignmentId: string, today: string, opts: { writeTargets: boolean; lastWeek?: number }) {
  const { count } = await tx.programAssignment.updateMany({ where: { id: assignmentId, endedAt: null }, data: { endedAt: new Date() } });
  if (!count) return;
  const a = await tx.programAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { bases: true } });
  await tx.planSeries.deleteMany({ where: { programAssignmentId: a.id, startDate: { gte: today } } });
  await tx.planSeries.updateMany({ where: { programAssignmentId: a.id, OR: [{ endDate: null }, { endDate: { gte: today } }] }, data: { endDate: addDays(today, -1) } });
  if (!opts.writeTargets) return;
  const rule = ruleOfAssignment(a);
  // Досрочно — последняя полностью прошедшая неделя; по сроку — последняя неделя программы
  const lastWeek = opts.lastWeek ?? (programWeekIndex(a.startDate, today) ?? 1) - 1;
  for (const b of a.bases) {
    if (b.weight <= 0) continue;
    const weight = lastLoadedWeight(rule, b, lastWeek);
    await tx.coachTarget.upsert({
      where: { clientId_templateId_exerciseId: { clientId: a.clientId, templateId: b.templateId, exerciseId: b.exerciseId } },
      create: { clientId: a.clientId, templateId: b.templateId, exerciseId: b.exerciseId, weight },
      update: { weight, fails: 0 },
    });
  }
}

type Program = {
  id: string;
  name: string;
  rule: ProgramRule;
  days: { weekday: number; templateId: string; templateName: string; time: string; durationMin: number }[];
};

/**
 * Назначить программу клиенту (в транзакции; строка клиента уже под FOR UPDATE): прежнее активное назначение
 * закрывается с записью весов, создаётся снимок, базы и серии с понедельника старта на N недель, уведомление.
 */
export async function assignProgram(
  tx: Tx,
  coachId: string,
  clientId: string,
  program: Program,
  input: { startDate: string; bases: { templateId: string; exerciseId: string; weight: number }[] },
  today: string,
) {
  const active = await tx.programAssignment.findMany({ where: { clientId, endedAt: null }, select: { id: true } });
  for (const a of active) await endAssignment(tx, a.id, today, { writeTargets: true });

  const { rule } = program;
  const assignment = await tx.programAssignment.create({
    data: { clientId, coachId, programId: program.id, name: program.name, startDate: input.startDate, ...rule },
    select: { id: true },
  });
  const templateIds = new Set(program.days.map((d) => d.templateId));
  const bases = input.bases.filter((b) => templateIds.has(b.templateId));
  if (bases.length) await tx.programBase.createMany({ data: bases.map((b) => ({ ...b, assignmentId: assignment.id })), skipDuplicates: true });

  const endDate = programEndDay(input.startDate, rule.weeks);
  const starts = seriesStarts(input.startDate, program.days.map((d) => d.weekday), today);
  await tx.planSeries.createMany({
    data: program.days.map((d, i) => ({
      userId: clientId,
      coachId,
      programAssignmentId: assignment.id,
      templateId: d.templateId,
      title: d.templateName,
      weekday: d.weekday,
      time: d.time,
      durationMin: d.durationMin,
      startDate: starts[i].startDate,
      endDate,
    })),
  });
  const first = starts.map((s) => s.startDate).toSorted()[0] ?? input.startDate;
  await notify(
    tx,
    clientId,
    {
      type: NotificationType.COACH,
      title: "Новая программа от тренера",
      body: `${program.name}, ${rule.weeks} ${plural(rule.weeks, "неделя", "недели", "недель")} с ${fmt(input.startDate)}`,
      url: `/calendar?date=${first}`,
    },
    { push: true },
  );
  return assignment.id;
}

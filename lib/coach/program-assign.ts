import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { NotificationType } from "@/generated/prisma/enums";
import { basesToWrite, lastLoadedWeight, programEndDay, programWeekIndex, seriesCutoff, seriesStarts, targetEditedAfterEnd, type ProgramRule } from "@/lib/coach/program";
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
 * остаются; keepToday (досрочно) — сегодняшняя тоже остаётся. writeTargets — вес последней обычной недели (до lastWeek) переходит в задания тренера, чтобы клиент не
 * откатился к базе. Условно по endedAt = null: повторный вызов ничего не делает.
 */
export async function endAssignment(tx: Tx, assignmentId: string, today: string, opts: { writeTargets: boolean; lastWeek?: number; keepToday?: boolean }) {
  const { count } = await tx.programAssignment.updateMany({ where: { id: assignmentId, endedAt: null }, data: { endedAt: new Date() } });
  if (!count) return;
  const a = await tx.programAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { bases: true } });
  const cutoff = seriesCutoff(today, opts.keepToday ?? false);
  await tx.planSeries.deleteMany({ where: { programAssignmentId: a.id, startDate: { gte: cutoff } } });
  await tx.planSeries.updateMany({ where: { programAssignmentId: a.id, OR: [{ endDate: null }, { endDate: { gte: cutoff } }] }, data: { endDate: addDays(cutoff, -1) } });
  // Тренера нет (аккаунт удалён) — заданий у клиента от него тоже нет
  if (!opts.writeTargets || !a.coachId) return;
  const rule = ruleOfAssignment(a);
  // По сроку — последняя неделя программы (задание, правленное тренером после конца, не трогаем); досрочно — последняя прошедшая
  const natural = opts.lastWeek !== undefined;
  const lastWeek = opts.lastWeek ?? (programWeekIndex(a.startDate, today) ?? 1) - 1;
  const rows = await tx.templateExercise.findMany({
    where: { templateId: { in: a.bases.map((b) => b.templateId) }, template: { userId: a.coachId } },
    select: { templateId: true, exerciseId: true },
  });
  const bases = basesToWrite(a.bases, new Set(rows.map((r) => `${r.templateId}:${r.exerciseId}`)), lastWeek);
  const endDay = programEndDay(a.startDate, a.weeks);
  for (const b of bases) {
    const key = { clientId_templateId_exerciseId: { clientId: a.clientId, templateId: b.templateId, exerciseId: b.exerciseId } };
    if (natural) {
      const current = await tx.coachTarget.findUnique({ where: key, select: { updatedAt: true } });
      if (targetEditedAfterEnd(current?.updatedAt ?? null, endDay)) continue;
    }
    const weight = lastLoadedWeight(rule, b, lastWeek);
    await tx.coachTarget.upsert({
      where: key,
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
  // Сегодняшние тренировки программы, завершённой досрочно сегодня же, уступают день новой — без дубля в календаре
  const keptToday = { userId: clientId, endDate: today, programAssignment: { endedAt: { not: null } } };
  await tx.planSeries.deleteMany({ where: { ...keptToday, startDate: today } });
  await tx.planSeries.updateMany({ where: keptToday, data: { endDate: addDays(today, -1) } });

  const { rule } = program;
  const assignment = await tx.programAssignment.create({
    data: { clientId, coachId, programId: program.id, name: program.name, startDate: input.startDate, ...rule },
    select: { id: true },
  });
  // Базы — только силовые упражнения шаблонов программы (не любой id)
  const pairs = await tx.templateExercise.findMany({
    where: { templateId: { in: program.days.map((d) => d.templateId) }, template: { userId: coachId }, exercise: { kind: "REPS" } },
    select: { templateId: true, exerciseId: true },
  });
  const allowed = new Set(pairs.map((p) => `${p.templateId}:${p.exerciseId}`));
  const bases = input.bases.filter((b) => allowed.has(`${b.templateId}:${b.exerciseId}`));
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

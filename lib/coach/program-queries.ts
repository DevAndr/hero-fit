import "server-only";
import { programEndDay, type ProgramRule } from "@/lib/coach/program";
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

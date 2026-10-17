import "server-only";
import { programPreview, type ProgramRule } from "@/lib/coach/program";
import { db } from "@/lib/db";
import { CATALOG_PAGE, catalogRuleText, daysPerWeek } from "./rules";

export type CatalogItem = {
  id: string;
  name: string;
  author: { nickname: string; publicPage: boolean };
  weeks: number;
  perWeek: number;
  ruleText: string;
  participants: number;
};

type Row = {
  id: string;
  name: string;
  weeks: number;
  stepKind: "PERCENT" | "KG";
  stepValue: number;
  deloadEvery: number | null;
  deloadPct: number;
  publishedAt: Date | null;
  coach: { nickname: string | null; coachProfile: { publishedAt: Date | null } | null };
  days: { weekday: number }[];
};

const ROW_SELECT = {
  id: true,
  name: true,
  weeks: true,
  stepKind: true,
  stepValue: true,
  deloadEvery: true,
  deloadPct: true,
  publishedAt: true,
  coach: { select: { nickname: true, coachProfile: { select: { publishedAt: true } } } },
  days: { select: { weekday: true } },
} as const;

/** «Занимаются»: активные (не закрытые) запуски из каталога. */
export async function participants(programIds: string[]): Promise<Map<string, number>> {
  if (!programIds.length) return new Map();
  const rows = await db.programAssignment.groupBy({
    by: ["catalogProgramId"],
    where: { catalogProgramId: { in: programIds }, endedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.flatMap((r) => (r.catalogProgramId ? [[r.catalogProgramId, r._count._all] as const] : [])));
}

const toItem = (p: Row, count: number): CatalogItem => ({
  id: p.id,
  name: p.name,
  author: { nickname: p.coach.nickname ?? "", publicPage: Boolean(p.coach.coachProfile?.publishedAt) },
  weeks: p.weeks,
  perWeek: daysPerWeek(p.days),
  ruleText: catalogRuleText(p),
  participants: count,
});

/** Каталог: опубликованные, не снятые, автор — тренер. perWeek 5 = «5+». Порядок — занимаются ↓, затем публикация ↓. */
export async function listCatalog(opts: { perWeek: number | null; page: number }): Promise<{ items: CatalogItem[]; hasMore: boolean }> {
  const rows: Row[] = await db.coachProgram.findMany({
    where: { publishedAt: { not: null }, hiddenAt: null, coach: { isCoach: true, nickname: { not: null } } },
    select: ROW_SELECT,
  });
  const matching = rows.filter((p) => {
    if (opts.perWeek === null) return true;
    const n = daysPerWeek(p.days);
    return opts.perWeek >= 5 ? n >= 5 : n === opts.perWeek;
  });
  const counts = await participants(matching.map((p) => p.id));
  const sorted = matching
    .map((p) => ({ item: toItem(p, counts.get(p.id) ?? 0), at: p.publishedAt?.getTime() ?? 0 }))
    .sort((a, b) => b.item.participants - a.item.participants || b.at - a.at)
    .map((x) => x.item);
  const from = (Math.max(1, opts.page) - 1) * CATALOG_PAGE;
  return { items: sorted.slice(from, from + CATALOG_PAGE), hasMore: sorted.length > from + CATALOG_PAGE };
}

export type CatalogProgram = CatalogItem & {
  description: string;
  days: { weekday: number; title: string; exercises: { name: string; sets: number; reps: string }[] }[];
  preview: ReturnType<typeof programPreview>;
  isAuthor: boolean;
};

/** Страница программы; неопубликованную и снятую видит только автор. */
export async function getCatalogProgram(id: string, viewerId: string): Promise<CatalogProgram | null> {
  const p = await db.coachProgram.findUnique({
    where: { id },
    select: {
      ...ROW_SELECT,
      coachId: true,
      hiddenAt: true,
      catalogDescription: true,
      coach: { select: { isCoach: true, nickname: true, coachProfile: { select: { publishedAt: true } } } },
      days: {
        orderBy: { weekday: "asc" },
        select: {
          weekday: true,
          template: {
            select: {
              name: true,
              exercises: { orderBy: { order: "asc" }, select: { targetSets: true, targetReps: true, exercise: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!p) return null;
  const isAuthor = p.coachId === viewerId;
  const visible = p.publishedAt !== null && p.hiddenAt === null && p.coach.isCoach && p.coach.nickname !== null;
  if (!visible && !isAuthor) return null;
  const count = (await participants([p.id])).get(p.id) ?? 0;
  const rule: ProgramRule = { weeks: p.weeks, stepKind: p.stepKind, stepValue: p.stepValue, deloadEvery: p.deloadEvery, deloadPct: p.deloadPct };
  return {
    ...toItem({ ...p, days: p.days.map((d) => ({ weekday: d.weekday })) }, count),
    description: p.catalogDescription ?? "",
    days: p.days.map((d) => ({
      weekday: d.weekday,
      title: d.template.name,
      exercises: d.template.exercises.map((e) => ({ name: e.exercise.name, sets: e.targetSets, reps: e.targetReps === null ? "—" : String(e.targetReps) })),
    })),
    preview: programPreview(rule, { weight: 100, fromWeek: 1 }),
    isAuthor,
  };
}

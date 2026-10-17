import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { clientDisplayName } from "@/lib/coach/clients";
import { programEndDay } from "@/lib/coach/program";
import {
  buildClientRow,
  buildTotals,
  isCoachRecapRow,
  isCoachRecapTotals,
  recapReadyAt,
  sortRecapRows,
  type ClientRecapInput,
  type CoachRecapRow,
  type CoachRecapTotals,
} from "@/lib/coach/recap";
import { clientSignals } from "@/lib/coach/signals";
import { getSignalInput } from "@/lib/coach/signals-queries";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays } from "@/lib/plans/expand";
import { getCalendar } from "@/lib/plans/queries";
import { addWeeks, localMidnight } from "@/lib/progress/weekly-streak";
import { isFinishMeta } from "@/lib/recap/meta";
import { isRecapWeek, recapWeekFor } from "@/lib/recap/schedule";

export type CoachRecapView = {
  id: string;
  week: string;
  totals: CoachRecapTotals;
  seenAt: Date | null;
  rows: { clientId: string; name: string; row: CoachRecapRow }[];
};

/** Неделя [start, end) — от понедельника 00:00 до следующего понедельника 00:00 в поясе tz. */
const bounds = (week: string, tz: string) => ({ start: localMidnight(week, tz), end: localMidnight(addWeeks(week, 1), tz) });

const completedIn = (userId: string, start: Date, end: Date) => ({
  userId,
  status: WorkoutStatus.COMPLETED,
  finishedAt: { gte: start, lt: end },
});

/**
 * Данные строки клиента за неделю week: те же даты пн…вс, но в поясе клиента (как план клиента).
 * weekStart — начало недели в поясе тренера (для «новый»).
 */
async function loadClientRecapInput(
  coachId: string,
  link: { clientId: string; createdAt: Date; tz: string },
  week: string,
  weekStart: Date,
  now: Date,
): Promise<ClientRecapInput> {
  const { clientId, createdAt, tz } = link;
  const { start, end } = bounds(week, tz);
  const prev = bounds(addWeeks(week, -1), tz);
  const sunday = addDays(week, 6);

  const [workouts, prevWorkouts, unanswered, calendar, programs, signalInput] = await Promise.all([
    db.workout.findMany({ where: completedIn(clientId, start, end), select: { id: true }, orderBy: { finishedAt: "asc" } }),
    db.workout.count({ where: completedIn(clientId, prev.start, prev.end) }),
    // Ответ — любой комментарий этого тренера к тренировке, в том числе к упражнению
    db.workout.count({ where: { ...completedIn(clientId, start, end), comments: { none: { coachId } } } }),
    getCalendar(clientId, week, sunday, tz, now),
    db.programAssignment.findMany({
      where: { clientId, coachId, startDate: { lte: sunday }, OR: [{ endedAt: null }, { endedAt: { gte: end } }] },
      select: { startDate: true, weeks: true, deloadEvery: true },
      orderBy: { createdAt: "desc" },
    }),
    getSignalInput(coachId, clientId, tz, createdAt, now),
  ]);

  const ids = workouts.map((w) => w.id);
  const events = ids.length
    ? await db.xpEvent.findMany({ where: { workoutId: { in: ids }, reason: XpReason.WORKOUT_COMPLETED }, select: { workoutId: true, meta: true } })
    : [];
  // meta — в порядке тренировок недели
  const metaByWorkout = new Map(events.map((e) => [e.workoutId, e.meta]));
  const metas = ids.map((id) => metaByWorkout.get(id)).filter(isFinishMeta);

  // Вхождения этого тренера; нет ни одного — нет поля (total 0 не бывает)
  const mine = calendar.occurrences.filter((o) => o.coachId === coachId);
  const program = programs.find((p) => programEndDay(p.startDate, p.weeks) >= sunday) ?? null;

  return {
    isNew: createdAt >= weekStart,
    plan: mine.length ? { done: mine.filter((o) => o.status === "done").length, total: mine.length } : null,
    workouts: ids.length,
    prevWorkouts,
    metas,
    program,
    sunday,
    signals: clientSignals(signalInput, now, tz).map((s) => s.kind),
    unanswered,
  };
}

/** Сколько клиентов собирать параллельно. */
const CLIENTS_CHUNK = 5;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Снимок итогов недели week тренера (без проверки окна — для тика). Клиенты — активные связи, созданные до конца
 * недели (в поясе тренера). Нет клиентов, неделя ещё не кончилась у кого-то из клиентов (пояс западнее)
 * или снимок уже есть (гонка тика и страницы) — false.
 */
export async function createCoachRecap(coachId: string, week: string, coachTz: string, now = new Date()): Promise<boolean> {
  const { start: weekStart, end: weekEnd } = bounds(week, coachTz);
  const links = await db.coachLink.findMany({
    where: { coachId, endedAt: null, createdAt: { lt: weekEnd } },
    select: { createdAt: true, client: { select: { id: true, timeZone: true } } },
  });
  if (!links.length) return false;
  const clients = links.map(({ createdAt, client }) => ({ clientId: client.id, createdAt, tz: safeTimeZone(client.timeZone) }));
  // Неделя ещё идёт у клиента западнее тренера — снимок рано (он не меняется); тик проверит снова дёшево
  const readyAt = recapReadyAt(week, clients.map((c) => c.tz));
  if (readyAt && now < readyAt) return false;

  // Чанками: сотни клиентов разом заняли бы весь пул соединений
  const inputs: ClientRecapInput[] = [];
  for (let i = 0; i < clients.length; i += CLIENTS_CHUNK) {
    const chunk = clients.slice(i, i + CLIENTS_CHUNK);
    inputs.push(...(await Promise.all(chunk.map((c) => loadClientRecapInput(coachId, c, week, weekStart, now)))));
  }
  const prevRecap = await db.coachWeeklyRecap.findUnique({ where: { coachId_week: { coachId, week: addWeeks(week, -1) } }, select: { data: true } });
  const rows = inputs.map((input, i) => ({ clientId: clients[i].clientId, row: buildClientRow(input) }));
  const totals = buildTotals(
    rows.map((r) => r.row),
    isCoachRecapTotals(prevRecap?.data) ? prevRecap.data : null,
  );

  try {
    await db.$transaction(async (tx) => {
      const recap = await tx.coachWeeklyRecap.create({ data: { coachId, week, data: totals }, select: { id: true } });
      await tx.coachRecapClient.createMany({ data: rows.map((r) => ({ recapId: recap.id, clientId: r.clientId, data: r.row })) });
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

export async function getCoachRecap(coachId: string, week: string): Promise<CoachRecapView | null> {
  const recap = await db.coachWeeklyRecap.findUnique({
    where: { coachId_week: { coachId, week } },
    select: {
      id: true,
      week: true,
      data: true,
      seenAt: true,
      clients: { select: { clientId: true, data: true, client: { select: { nickname: true, name: true } } } },
    },
  });
  if (!recap || !isCoachRecapTotals(recap.data)) return null;
  const rows = recap.clients.flatMap((c) =>
    isCoachRecapRow(c.data) ? [{ clientId: c.clientId, name: clientDisplayName(c.client), row: c.data }] : [],
  );
  return { id: recap.id, week: recap.week, totals: recap.data, seenAt: recap.seenAt, rows: sortRecapRows(rows) };
}

/** Снимок недели; если его нет, неделя закончилась и не старше RECAP_LAZY_WEEKS — создаёт на лету, без push. */
export async function getOrCreateCoachRecap(coachId: string, week: string, coachTz: string, now = new Date()): Promise<CoachRecapView | null> {
  const existing = await getCoachRecap(coachId, week);
  if (existing || isRecapWeek(week, now, coachTz) !== "ok") return existing;
  await createCoachRecap(coachId, week, coachTz, now);
  return getCoachRecap(coachId, week);
}

export const COACH_RECAPS_PAGE = 20;

export async function listCoachRecaps(coachId: string, page: number): Promise<{ items: { week: string; totals: CoachRecapTotals }[]; hasMore: boolean }> {
  const rows = await db.coachWeeklyRecap.findMany({
    where: { coachId },
    select: { week: true, data: true },
    orderBy: { week: "desc" },
    skip: (Math.max(1, page) - 1) * COACH_RECAPS_PAGE,
    take: COACH_RECAPS_PAGE + 1,
  });
  return {
    items: rows.slice(0, COACH_RECAPS_PAGE).flatMap((r) => (isCoachRecapTotals(r.data) ? [{ week: r.week, totals: r.data }] : [])),
    hasMore: rows.length > COACH_RECAPS_PAGE,
  };
}

export async function adjacentCoachRecaps(coachId: string, week: string): Promise<{ prev: string | null; next: string | null }> {
  const [prev, next] = await Promise.all([
    db.coachWeeklyRecap.findFirst({ where: { coachId, week: { lt: week } }, orderBy: { week: "desc" }, select: { week: true } }),
    db.coachWeeklyRecap.findFirst({ where: { coachId, week: { gt: week } }, orderBy: { week: "asc" }, select: { week: true } }),
  ]);
  return { prev: prev?.week ?? null, next: next?.week ?? null };
}

/** Отметить просмотр; true — отмечено впервые (для цели Метрики). */
export async function markCoachRecapSeen(coachId: string, week: string): Promise<boolean> {
  const { count } = await db.coachWeeklyRecap.updateMany({ where: { coachId, week, seenAt: null }, data: { seenAt: new Date() } });
  return count > 0;
}

/** Непросмотренные итоги прошлой недели (для анонса на /coach). */
export async function unseenCoachRecap(coachId: string, coachTz: string, now = new Date()): Promise<{ week: string; totals: CoachRecapTotals } | null> {
  const week = recapWeekFor(now, coachTz);
  const recap = await db.coachWeeklyRecap.findFirst({ where: { coachId, week, seenAt: null }, select: { data: true } });
  return recap && isCoachRecapTotals(recap.data) ? { week, totals: recap.data } : null;
}

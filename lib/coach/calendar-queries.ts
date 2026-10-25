import "server-only";
import { CALENDAR_CONCURRENCY, statusOf, type CoachCalendarItem } from "@/lib/coach/calendar";
import { clientDisplayName } from "@/lib/coach/clients";
import { coachOccurrences } from "@/lib/coach/plan-queries";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";

/** Группа этого тренера или null (чужая, несуществующая, мусор в адресе — без фильтра). */
export async function ownGroupId(coachId: string, groupId: string | null | undefined): Promise<string | null> {
  if (!groupId || groupId.length > 64) return null;
  const g = await db.coachGroup.findFirst({ where: { id: groupId, coachId }, select: { id: true } });
  return g?.id ?? null;
}

/**
 * Назначения тренера всем активным клиентам за [from, to] (местные даты клиентов). Календарь считается только
 * у клиентов, у которых в диапазоне есть что-то от тренера, — не больше CALENDAR_CONCURRENCY одновременно.
 * clients — активных клиентов (с учётом группы), для пустого состояния.
 */
export async function getCoachCalendar(
  coachId: string,
  from: string,
  to: string,
  opts: { groupId: string | null; now: Date },
): Promise<{ clients: number; items: CoachCalendarItem[] }> {
  const links = await db.coachLink.findMany({
    where: {
      coachId,
      endedAt: null,
      ...(opts.groupId ? { client: { coachGroupMembers: { some: { groupId: opts.groupId } } } } : {}),
    },
    select: { client: { select: { id: true, nickname: true, name: true, timeZone: true } } },
  });
  const ids = links.map((l) => l.client.id);
  if (!ids.length) return { clients: 0, items: [] };

  const [series, entries] = await Promise.all([
    db.planSeries.findMany({
      where: { userId: { in: ids }, coachId, startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }] },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.planEntry.findMany({
      where: { userId: { in: ids }, date: { gte: from, lte: to }, OR: [{ coachId }, { series: { coachId } }] },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);
  const withPlans = new Set([...series, ...entries].map((r) => r.userId));
  const clients = links.map((l) => l.client).filter((c) => withPlans.has(c.id));

  const items: CoachCalendarItem[] = [];
  for (let i = 0; i < clients.length; i += CALENDAR_CONCURRENCY) {
    const batch = await Promise.all(
      clients.slice(i, i + CALENDAR_CONCURRENCY).map(async (c) => {
        const tz = safeTimeZone(c.timeZone);
        const occurrences = await coachOccurrences(coachId, c.id, from, to, tz, opts.now);
        const clientName = clientDisplayName(c);
        return occurrences.map((o) => ({
          key: o.key,
          clientId: c.id,
          clientName,
          clientTz: tz,
          date: o.date,
          time: o.time,
          title: o.title,
          status: statusOf(o.status),
        }));
      }),
    );
    items.push(...batch.flat());
  }
  return { clients: ids.length, items };
}

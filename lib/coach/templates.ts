import "server-only";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays } from "@/lib/plans/expand";

/**
 * Шаблоны активного тренера, назначенные клиенту и ещё актуальные: серия не кончилась, разовая
 * (или исключение серии) не отменена и не в прошлом. since — вчера в поясе клиента: «Вчера были … — сделать сегодня?».
 */
export function assignedWhere(clientId: string, coachId: string, since: string) {
  return {
    userId: coachId,
    OR: [
      { planSeries: { some: { userId: clientId, coachId, OR: [{ endDate: null }, { endDate: { gte: since } }] } } },
      { planEntries: { some: { userId: clientId, coachId, seriesId: null, cancelled: false, date: { gte: since } } } },
      // «Только эту» с другим шаблоном — исключение серии тренера (принадлежность по серии)
      { planEntries: { some: { userId: clientId, cancelled: false, date: { gte: since }, series: { coachId } } } },
    ],
  };
}

/** Активный тренер клиента и «вчера» в поясе клиента (граница актуальных назначений). */
async function activeCoach(clientId: string, now = new Date()): Promise<{ coachId: string; since: string } | null> {
  const link = await db.coachLink.findFirst({
    where: { clientId, endedAt: null },
    select: { coachId: true, client: { select: { timeZone: true } } },
  });
  if (!link) return null;
  return { coachId: link.coachId, since: addDays(dayKey(now, safeTimeZone(link.client.timeZone)), -1) };
}

/** Раздел «От тренера» в /training: назначенные клиенту шаблоны активного тренера (форма — как у getStartOptions). */
export async function getAssignedTemplates(clientId: string) {
  const coach = await activeCoach(clientId);
  if (!coach) return [];
  return db.workoutTemplate.findMany({
    where: assignedWhere(clientId, coach.coachId, coach.since),
    orderBy: { name: "asc" },
    select: {
      id: true,
      userId: true,
      name: true,
      program: true,
      description: true,
      exercises: { orderBy: { order: "asc" }, select: { targetSets: true, exercise: { select: { name: true } } } },
    },
  });
}

/**
 * Единая проверка доступа к шаблону для запуска тренировки: свой, встроенный или шаблон
 * активного тренера, назначенный этому пользователю. Разрыв связи закрывает доступ сразу.
 */
export async function templateAccessible(userId: string, templateId: string): Promise<boolean> {
  const own = await db.workoutTemplate.count({ where: { id: templateId, OR: [{ userId }, { userId: null }] } });
  if (own) return true;
  const coach = await activeCoach(userId);
  if (!coach) return false;
  return (await db.workoutTemplate.count({ where: { id: templateId, ...assignedWhere(userId, coach.coachId, coach.since) } })) > 0;
}

/** Скольким клиентам назначен каждый шаблон тренера (предупреждение при удалении). */
export async function assignedClientCounts(coachId: string, now = new Date()): Promise<Record<string, number>> {
  // Только актуальные назначения; пояса клиентов разные — граница «вчера по UTC» с запасом в сутки
  const since = addDays(dayKey(now, "UTC"), -1);
  const [series, entries] = await Promise.all([
    db.planSeries.findMany({
      where: { coachId, templateId: { not: null }, OR: [{ endDate: null }, { endDate: { gte: since } }] },
      select: { templateId: true, userId: true },
      distinct: ["templateId", "userId"],
    }),
    db.planEntry.findMany({
      where: { coachId, seriesId: null, cancelled: false, date: { gte: since }, templateId: { not: null } },
      select: { templateId: true, userId: true },
      distinct: ["templateId", "userId"],
    }),
  ]);
  const clients = new Map<string, Set<string>>();
  for (const r of [...series, ...entries]) {
    const set = clients.get(r.templateId!) ?? new Set<string>();
    set.add(r.userId);
    clients.set(r.templateId!, set);
  }
  return Object.fromEntries([...clients].map(([id, set]) => [id, set.size]));
}

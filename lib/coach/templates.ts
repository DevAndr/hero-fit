import "server-only";
import { db } from "@/lib/db";

/** Шаблоны активного тренера, назначенные клиенту (серией или разовой записью). */
function assignedWhere(clientId: string, coachId: string) {
  return {
    userId: coachId,
    OR: [{ planSeries: { some: { userId: clientId, coachId } } }, { planEntries: { some: { userId: clientId, coachId, seriesId: null } } }],
  };
}

async function activeCoachId(clientId: string): Promise<string | null> {
  const link = await db.coachLink.findFirst({ where: { clientId, endedAt: null }, select: { coachId: true } });
  return link?.coachId ?? null;
}

/** Раздел «От тренера» в /training: назначенные клиенту шаблоны активного тренера (форма — как у getStartOptions). */
export async function getAssignedTemplates(clientId: string) {
  const coachId = await activeCoachId(clientId);
  if (!coachId) return [];
  return db.workoutTemplate.findMany({
    where: assignedWhere(clientId, coachId),
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
  const coachId = await activeCoachId(userId);
  if (!coachId) return false;
  return (await db.workoutTemplate.count({ where: { id: templateId, ...assignedWhere(userId, coachId) } })) > 0;
}

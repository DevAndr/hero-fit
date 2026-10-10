import "server-only";
import { db } from "@/lib/db";
import type { Target } from "@/lib/coach/targets";

/** Задания клиента по шаблону (ключ — exerciseId); пусто, если шаблон не активного тренера клиента. */
export async function getTemplateTargets(clientId: string, templateId: string): Promise<Map<string, Target>> {
  const link = await db.coachLink.findFirst({ where: { clientId, endedAt: null }, select: { coachId: true } });
  if (!link) return new Map();
  const rows = await db.coachTarget.findMany({
    where: { clientId, templateId, template: { userId: link.coachId } },
    select: { exerciseId: true, sets: true, reps: true, weight: true },
  });
  return new Map(rows.map(({ exerciseId, ...t }) => [exerciseId, t]));
}

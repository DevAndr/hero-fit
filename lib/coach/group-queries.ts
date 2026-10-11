import "server-only";
import type { CoachGroupView } from "@/lib/coach/groups";
import { db } from "@/lib/db";

/** Группы тренера по названию; участники — только активные клиенты (строка отвязанного могла остаться). */
export async function getCoachGroups(coachId: string): Promise<CoachGroupView[]> {
  const groups = await db.coachGroup.findMany({
    where: { coachId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      members: {
        where: { client: { coachLinks: { some: { coachId, endedAt: null } } } },
        orderBy: { createdAt: "asc" },
        select: { clientId: true },
      },
    },
  });
  return groups.map((g) => ({ id: g.id, name: g.name, clientIds: g.members.map((m) => m.clientId) }));
}

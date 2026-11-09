import { db } from "@/lib/db";
import { getOccurrence } from "@/lib/plans/queries";
import { upcomingSlot, type DraftHero } from "./draft-hero";

/** Черновик игрока (последний PLANNED) для героя дашборда; слот — из календаря, если вхождение не отменено и ещё впереди. */
export async function getDraftHero(userId: string, tz: string, now = new Date()): Promise<DraftHero | null> {
  const draft = await db.workout.findFirst({
    where: { userId, status: "PLANNED" },
    orderBy: { createdAt: "desc" },
    select: { name: true, planKey: true, _count: { select: { exercises: true } } },
  });
  if (!draft) return null;
  const [completed, found] = await Promise.all([
    db.workout.count({ where: { userId, status: "COMPLETED" } }),
    draft.planKey ? getOccurrence(userId, draft.planKey) : null,
  ]);
  return {
    name: draft.name,
    exercises: draft._count.exercises,
    hasCompleted: completed > 0,
    slot: upcomingSlot(found?.occurrence ?? null, tz, now),
  };
}

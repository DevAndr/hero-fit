import "server-only";
import { WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { getClientPlan } from "@/lib/coach/plan-queries";
import type { CoachStats } from "@/lib/coach/profile";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";

const DAY = 86_400_000;

/**
 * Цифры публичной страницы: только активные клиенты; рекорды — из meta события завершения
 * (как в ачивках); «% плана» — выполненные из прошедших назначений тренера (пропущенные клиентом не в счёт).
 */
export async function getCoachPublicStats(coachId: string, now = new Date()): Promise<CoachStats> {
  const [links, first] = await Promise.all([
    db.coachLink.findMany({ where: { coachId, endedAt: null }, select: { clientId: true, client: { select: { timeZone: true } } } }),
    db.coachLink.findFirst({ where: { coachId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const ids = links.map((l) => l.clientId);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [workouts, events, plans] = await Promise.all([
    ids.length ? db.workout.count({ where: { userId: { in: ids }, status: WorkoutStatus.COMPLETED, finishedAt: { gte: since30 } } }) : 0,
    ids.length
      ? db.xpEvent.findMany({
          where: { userId: { in: ids }, reason: XpReason.WORKOUT_COMPLETED, workout: { finishedAt: { gte: since30 } } },
          select: { meta: true },
        })
      : [],
    Promise.all(links.map((l) => getClientPlan(coachId, l.clientId, safeTimeZone(l.client.timeZone), now))),
  ]);
  const records = events.reduce((n, e) => n + (((e.meta as { records?: unknown[] } | null)?.records?.length) ?? 0), 0);
  const past = plans.flatMap((p) => p.past).filter((o) => o.status !== "skipped");
  const done = past.filter((o) => o.status === "done").length;
  return {
    clients: ids.length,
    workouts,
    records,
    plan: past.length ? done / past.length : null,
    planTotal: past.length,
    since: first?.createdAt ?? null,
  };
}

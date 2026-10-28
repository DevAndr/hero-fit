import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { getClientPlan } from "@/lib/coach/plan-queries";
import { statsToCompute, type CoachStats } from "@/lib/coach/profile";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { FINISH_REASONS } from "@/lib/progress/xp";
import { nicknameKey } from "@/lib/social/league";

const DAY = 86_400_000;

/**
 * Цифры публичной страницы: только активные клиенты; рекорды — из meta события завершения
 * (как в ачивках); «% плана» — выполненные из прошедших назначений тренера (пропущенные клиентом не в счёт).
 * hidden — скрытые на странице цифры: что не покажем, не считаем (страница публичная, план — запросы на каждого клиента).
 */
export async function getCoachPublicStats(coachId: string, now = new Date(), hidden: readonly string[] = []): Promise<CoachStats> {
  const [links, first] = await Promise.all([
    db.coachLink.findMany({ where: { coachId, endedAt: null }, select: { clientId: true, client: { select: { timeZone: true } } } }),
    db.coachLink.findFirst({ where: { coachId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const ids = links.map((l) => l.clientId);
  const need = statsToCompute(ids.length, hidden);
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [workouts, events, plans] = await Promise.all([
    need.activity ? db.workout.count({ where: { userId: { in: ids }, status: WorkoutStatus.COMPLETED, finishedAt: { gte: since30 } } }) : 0,
    need.activity
      ? db.xpEvent.findMany({
          where: { userId: { in: ids }, reason: { in: [...FINISH_REASONS] }, workout: { finishedAt: { gte: since30 } } },
          select: { meta: true },
        })
      : [],
    need.plan ? Promise.all(links.map((l) => getClientPlan(coachId, l.clientId, safeTimeZone(l.client.timeZone), now))) : [],
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

/** Тренер по нику из адреса (без учёта регистра) с профилем; публикацию проверяет вызывающий. */
export async function getPublicCoach(nick: string) {
  const user = await db.user.findFirst({
    where: { nicknameKey: nicknameKey(decodeURIComponent(nick)), isCoach: true, coachProfile: { isNot: null } },
    select: { id: true, nickname: true, coachCode: true, coachProfile: true },
  });
  if (!user?.coachProfile || !user.nickname) return null;
  return { id: user.id, nickname: user.nickname, coachCode: user.coachCode, profile: user.coachProfile };
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { TrainingSessionStatus, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { evaluateAchievements } from "@/lib/achievements/engine";
import { db } from "@/lib/db";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { notify } from "@/lib/notifications/service";
import { levelProgress } from "@/lib/progress/level";
import { levelUpGrants } from "@/lib/shop/coins";
import { grantCoinsDetailed } from "@/lib/shop/coins-db";
import { partnerName } from "@/lib/together/queries";
import { bonusEligible, bonusXp, type BonusInput } from "@/lib/together/rules";

const DAY = 86_400_000;
const WORKOUT = { id: true, status: true, startedAt: true, finishedAt: true, totalSets: true, xpEarned: true, stretchOnly: true } as const;
const PERSON = { id: true, nickname: true, timeZone: true } as const;

type W = { id: string; status: WorkoutStatus; startedAt: Date | null; finishedAt: Date | null; totalSets: number; xpEarned: number; stretchOnly: boolean } | null;
// Сессия растяжки — как тренировка без подходов: бонуса не даёт ни себе, ни партнёру
const input = (w: W): BonusInput => ({
  status: w?.status ?? null,
  startedAt: w?.startedAt ?? null,
  finishedAt: w?.finishedAt ?? null,
  totalSets: w?.stretchOnly ? 0 : (w?.totalSets ?? 0),
});

/** Был ли уже бонус в местных сутках получателя (сутки — по завершению его тренировки). */
async function hadBonusToday(tx: Prisma.TransactionClient, userId: string, timeZone: string, finishedAt: Date): Promise<boolean> {
  const tz = safeTimeZone(timeZone);
  const day = dayKey(finishedAt, tz);
  const recent = await tx.xpEvent.findMany({
    where: { userId, reason: XpReason.TOGETHER_BONUS, createdAt: { gte: new Date(finishedAt.getTime() - 2 * DAY) } },
    select: { createdAt: true },
  });
  return recent.some((e) => dayKey(e.createdAt, tz) === day);
}

/**
 * Тренировка завершена: если сессия с ней дошла до конца (обе COMPLETED или гость так и не начал) — ENDED,
 * и обоим, кому положено, бонус. Условный updateMany по ACTIVE — второй параллельный вызов ничего не выдаст.
 */
export async function closeIfDone(workoutId: string, now: Date): Promise<{ bonus: { userId: string; amount: number }[] }> {
  return db.$transaction(async (tx) => {
    const s = await tx.trainingSession.findFirst({
      where: { status: TrainingSessionStatus.ACTIVE, OR: [{ hostWorkoutId: workoutId }, { guestWorkoutId: workoutId }] },
      include: { host: { select: PERSON }, guest: { select: PERSON }, hostWorkout: { select: WORKOUT }, guestWorkout: { select: WORKOUT } },
    });
    if (!s) return { bonus: [] };
    const hostDone = s.hostWorkout?.status === WorkoutStatus.COMPLETED;
    const guestDone = s.guestWorkout?.status === WorkoutStatus.COMPLETED;
    const guestNeverStarted = !s.guestWorkoutId;
    if (!(hostDone && (guestDone || guestNeverStarted))) return { bonus: [] };

    const { count } = await tx.trainingSession.updateMany({
      where: { id: s.id, status: TrainingSessionStatus.ACTIVE, bonusAt: null },
      data: { status: TrainingSessionStatus.ENDED, endedAt: now, bonusAt: now },
    });
    if (count === 0) return { bonus: [] };

    const sides = [
      { me: s.host, mine: s.hostWorkout, other: s.guest, theirs: s.guestWorkout },
      { me: s.guest, mine: s.guestWorkout, other: s.host, theirs: s.hostWorkout },
    ];
    const bonus: { userId: string; amount: number }[] = [];
    for (const { me, mine, other, theirs } of sides) {
      if (!mine?.finishedAt) continue;
      const ok = bonusEligible(input(mine), input(theirs), await hadBonusToday(tx, me.id, me.timeZone, mine.finishedAt));
      if (ok !== true) continue;
      const amount = bonusXp(mine.xpEarned);
      await tx.xpEvent.create({ data: { userId: me.id, amount, reason: XpReason.TOGETHER_BONUS, meta: { sessionId: s.id, workoutId: mine.id } } });
      const { xp } = await tx.user.update({ where: { id: me.id }, data: { xp: { increment: amount } }, select: { xp: true } });
      await tx.user.update({ where: { id: me.id }, data: { level: levelProgress(xp).level } });
      await grantCoinsDetailed(tx, me.id, levelUpGrants(xp - amount, xp));
      await evaluateAchievements(tx, me.id);
      await notify(
        tx,
        me.id,
        { type: "SOCIAL", title: `+${amount} XP — тренировка с ${partnerName(other.nickname)}`, body: "Бонус за совместную тренировку", url: `/workouts/${mine.id}` },
        { push: true },
      );
      bonus.push({ userId: me.id, amount });
    }
    return { bonus };
  });
}

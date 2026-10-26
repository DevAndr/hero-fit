import "server-only";
import { XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { partnerName, settle } from "@/lib/together/queries";
import { bonusNote, overlapMinutes } from "@/lib/together/rules";

export type TogetherSummary = { partner: string; durationSec: number | null; sets: number; records: number; overlapMin: number | null; note: string };

const W = { id: true, status: true, startedAt: true, finishedAt: true, durationSec: true, totalSets: true } as const;

/** Блок «Вместе с …» в сводке тренировки; тренировка не в совместной сессии — null. */
export async function getTogetherSummary(userId: string, workoutId: string): Promise<TogetherSummary | null> {
  const row = await db.trainingSession.findFirst({
    where: { acceptedAt: { not: null }, OR: [{ hostWorkoutId: workoutId, hostId: userId }, { guestWorkoutId: workoutId, guestId: userId }] },
    include: { host: { select: { nickname: true } }, guest: { select: { nickname: true } }, hostWorkout: { select: W }, guestWorkout: { select: W } },
  });
  if (!row) return null;
  const s = await settle(db, row, new Date());
  const isHost = row.hostId === userId;
  const mine = isHost ? row.hostWorkout : row.guestWorkout;
  const theirs = isHost ? row.guestWorkout : row.hostWorkout;
  const partner = partnerName(isHost ? row.guest.nickname : row.host.nickname);
  const [bonus, records] = await Promise.all([
    db.xpEvent.findFirst({ where: { userId, reason: XpReason.TOGETHER_BONUS, meta: { path: ["sessionId"], equals: row.id } }, select: { amount: true } }),
    theirs ? db.xpEvent.count({ where: { workoutId: theirs.id, reason: XpReason.PERSONAL_RECORD } }) : 0,
  ]);
  const input = (w: typeof mine) => ({ status: w?.status ?? null, startedAt: w?.startedAt ?? null, finishedAt: w?.finishedAt ?? null, totalSets: w?.totalSets ?? 0 });
  const both = mine?.startedAt && mine.finishedAt && theirs?.startedAt && theirs.finishedAt;
  return {
    partner,
    durationSec: theirs?.durationSec ?? null,
    sets: theirs?.totalSets ?? 0,
    records,
    overlapMin: both ? overlapMinutes({ startedAt: mine.startedAt!, finishedAt: mine.finishedAt! }, { startedAt: theirs.startedAt!, finishedAt: theirs.finishedAt! }) : null,
    note: bonusNote({ awarded: bonus?.amount ?? null, sessionStatus: s.status, endReason: s.endReason, mine: input(mine), theirs: input(theirs), partner }),
  };
}

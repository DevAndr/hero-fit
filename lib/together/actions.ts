"use server";

import { TrainingSessionStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { queueGoal } from "@/lib/analytics/queue";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { notify } from "@/lib/notifications/service";
import { friendIds } from "@/lib/social/queries";
import { endSession, inviteCandidates, lockUsers, openSessionOf, partnerName, releaseWorkout, runningWorkoutId, settle } from "@/lib/together/queries";
import { canCheer, inviteExpiresAt } from "@/lib/together/rules";

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

async function guard() {
  const user = await requireUser();
  return (await isEnabled("together", user.id)) ? user : null;
}

const UNAVAILABLE = "Совместные тренировки недоступны";
const BUSY = "Уже есть совместная тренировка";

/** Друзья, которых можно позвать (лист «Позвать друга»). */
export async function inviteCandidatesAction(): Promise<{ id: string; name: string; together: number }[]> {
  const user = await guard();
  return user ? inviteCandidates(user.id) : [];
}

export async function inviteAction(workoutId: string, friendId: string): Promise<{ ok: true; sessionId: string; expiresAt: string } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  if (!(await friendIds(user.id)).includes(friendId) || !(await isEnabled("together", friendId))) return fail("Позвать можно только друга");
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    await lockUsers(tx, [user.id, friendId]);
    const workout = await tx.workout.findFirst({ where: { id: workoutId, userId: user.id, status: WorkoutStatus.IN_PROGRESS }, select: { id: true } });
    if (!workout) return fail("Сначала начните тренировку");
    if (await openSessionOf(tx, user.id, now)) return fail(BUSY);
    if (await openSessionOf(tx, friendId, now)) return fail("Друг уже тренируется вместе с кем-то");
    await releaseWorkout(tx, workoutId);
    const session = await tx.trainingSession.create({ data: { hostId: user.id, guestId: friendId, hostWorkoutId: workoutId, createdAt: now } });
    const host = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } });
    await notify(
      tx,
      friendId,
      { type: "SOCIAL", title: `${partnerName(host.nickname)} в зале`, body: "Тренируйся вместе — приглашение действует 15 минут", url: `/together/${session.id}` },
      { push: true },
    );
    return { ok: true as const, sessionId: session.id, expiresAt: inviteExpiresAt(now).toISOString() };
  });
  if (result.ok) await queueGoal("together_invite");
  return result;
}

export async function cancelInviteAction(sessionId: string): Promise<{ ok: true } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  await db.trainingSession.updateMany({
    where: { id: sessionId, hostId: user.id, status: TrainingSessionStatus.INVITED },
    data: { status: TrainingSessionStatus.DECLINED, endedAt: new Date(), endReason: "cancelled" },
  });
  return { ok: true };
}

export async function acceptAction(sessionId: string): Promise<{ ok: true; workoutId: string | null } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const row = await tx.trainingSession.findFirst({ where: { id: sessionId, guestId: user.id } });
    if (!row) return fail("Приглашение не найдено");
    await lockUsers(tx, [row.hostId, row.guestId]);
    const fresh = await tx.trainingSession.findUniqueOrThrow({ where: { id: sessionId } });
    const s = await settle(tx, fresh, now);
    if (s.status === "ACTIVE") return { ok: true as const, workoutId: s.guestWorkoutId };
    if (s.status !== "INVITED") return fail(s.status === "EXPIRED" ? "Приглашение истекло" : "Приглашение больше не действует");
    const other = await openSessionOf(tx, user.id, now);
    if (other && other.id !== s.id) return fail(BUSY);
    const workoutId = await runningWorkoutId(tx, user.id);
    if (workoutId) await releaseWorkout(tx, workoutId);
    await tx.trainingSession.update({
      where: { id: s.id },
      data: { status: TrainingSessionStatus.ACTIVE, acceptedAt: now, guestWorkoutId: workoutId },
    });
    return { ok: true as const, workoutId, joined: true };
  });
  if (!result.ok) return result;
  if ("joined" in result) await queueGoal("together_join");
  return { ok: true, workoutId: result.workoutId };
}

export async function declineAction(sessionId: string): Promise<{ ok: true } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  await db.$transaction(async (tx) => {
    const { count } = await tx.trainingSession.updateMany({
      where: { id: sessionId, guestId: user.id, status: TrainingSessionStatus.INVITED },
      data: { status: TrainingSessionStatus.DECLINED, endedAt: new Date() },
    });
    if (count === 0) return;
    const [s, guest] = await Promise.all([
      tx.trainingSession.findUniqueOrThrow({ where: { id: sessionId }, select: { hostId: true } }),
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { nickname: true } }),
    ]);
    await notify(tx, s.hostId, { type: "SOCIAL", title: `${partnerName(guest.nickname)} не сможет сейчас`, body: "Приглашение потренироваться вместе отклонено" }, { push: false });
  });
  return { ok: true };
}

export async function leaveAction(sessionId: string): Promise<{ ok: true } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  await db.$transaction(async (tx) => {
    const s = await tx.trainingSession.findFirst({ where: { id: sessionId, OR: [{ hostId: user.id }, { guestId: user.id }] }, select: { id: true } });
    if (s) await endSession(tx, s.id, "left", new Date());
  });
  return { ok: true };
}

export async function cheerAction(sessionId: string): Promise<{ ok: true } | Fail> {
  const user = await guard();
  if (!user) return fail(UNAVAILABLE);
  const now = new Date();
  const row = await db.trainingSession.findFirst({ where: { id: sessionId, OR: [{ hostId: user.id }, { guestId: user.id }] } });
  if (!row || (await settle(db, row, now)).status !== "ACTIVE") return fail("Совместная тренировка закончилась");
  const last = await db.sessionCheer.findFirst({ where: { sessionId, fromId: user.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (!canCheer(last?.createdAt ?? null, now)) return fail("Не так часто 🙂");
  await db.sessionCheer.create({ data: { sessionId, fromId: user.id, createdAt: now } });
  return { ok: true };
}

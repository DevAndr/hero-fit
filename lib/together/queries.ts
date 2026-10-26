import "server-only";
import { Prisma, type TrainingSession } from "@/generated/prisma/client";
import { TrainingSessionStatus, WorkoutStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { friendIds } from "@/lib/social/queries";
import { sessionState } from "@/lib/together/rules";

type Client = Prisma.TransactionClient | typeof db;

const OPEN = [TrainingSessionStatus.INVITED, TrainingSessionStatus.ACTIVE];

export const partnerName = (nickname: string | null) => nickname ?? "Атлет";

/** Ленивое истечение сохраняется при записи: статус в БД догоняет sessionState. */
export async function settle(client: Client, s: TrainingSession, now: Date): Promise<TrainingSession> {
  const state = sessionState(s, now);
  if (state === s.status) return s;
  const data = state === "ENDED" ? { status: state, endedAt: now, endReason: "timeout" } : { status: state };
  await client.trainingSession.updateMany({ where: { id: s.id, status: s.status }, data });
  return { ...s, ...data };
}

/** Открытая сессия человека (INVITED или ACTIVE) с учётом истечения. */
export async function openSessionOf(client: Client, userId: string, now: Date): Promise<TrainingSession | null> {
  const rows = await client.trainingSession.findMany({
    where: { status: { in: OPEN }, OR: [{ hostId: userId }, { guestId: userId }] },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) {
    const s = await settle(client, row, now);
    if (s.status === "INVITED" || s.status === "ACTIVE") return s;
  }
  return null;
}

/** «Одна открытая сессия на человека» — под блокировкой строк обоих пользователей (в порядке id). */
export async function lockUsers(tx: Prisma.TransactionClient, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
}

/** Тренировку из закрытых сессий отвязываем — она войдёт в новую (hostWorkoutId/guestWorkoutId уникальны). */
export async function releaseWorkout(tx: Prisma.TransactionClient, workoutId: string) {
  const closed = { status: { notIn: OPEN } };
  await tx.trainingSession.updateMany({ where: { hostWorkoutId: workoutId, ...closed }, data: { hostWorkoutId: null } });
  await tx.trainingSession.updateMany({ where: { guestWorkoutId: workoutId, ...closed }, data: { guestWorkoutId: null } });
}

/** Конец сессии: вышел, отменил тренировку или истекла. Бонуса нет. */
export async function endSession(tx: Prisma.TransactionClient, sessionId: string, reason: "left" | "cancelled" | "timeout", now: Date) {
  await tx.trainingSession.updateMany({
    where: { id: sessionId, status: { in: OPEN } },
    data: { status: TrainingSessionStatus.ENDED, endedAt: now, endReason: reason },
  });
}

/** Гость принял без тренировки — первая начатая им тренировка входит в сессию. */
export async function attachGuestWorkout(tx: Prisma.TransactionClient, userId: string, workoutId: string, now: Date) {
  const s = await openSessionOf(tx, userId, now);
  if (!s || s.status !== "ACTIVE" || s.guestId !== userId || s.guestWorkoutId) return;
  await releaseWorkout(tx, workoutId);
  await tx.trainingSession.updateMany({ where: { id: s.id, guestWorkoutId: null }, data: { guestWorkoutId: workoutId } });
}

/** Отмена тренировки её удаляет — открытая сессия с ней закрывается заранее. */
export async function endSessionOfWorkout(tx: Prisma.TransactionClient, workoutId: string, now: Date) {
  const s = await tx.trainingSession.findFirst({
    where: { status: { in: OPEN }, OR: [{ hostWorkoutId: workoutId }, { guestWorkoutId: workoutId }] },
    select: { id: true },
  });
  if (s) await endSession(tx, s.id, "cancelled", now);
}

/** Кого можно позвать: принятые друзья с флагом; сначала — с кем уже тренировались вместе, потом недавно заходившие. */
export async function inviteCandidates(userId: string): Promise<{ id: string; name: string; together: number }[]> {
  const ids = await friendIds(userId);
  const allowed = (await Promise.all(ids.map(async (id) => ((await isEnabled("together", id)) ? id : null)))).filter((x): x is string => x !== null);
  if (!allowed.length) return [];
  const [users, past] = await Promise.all([
    db.user.findMany({ where: { id: { in: allowed } }, select: { id: true, nickname: true, lastVisitHour: true } }),
    db.trainingSession.findMany({
      where: { acceptedAt: { not: null }, OR: [{ hostId: userId, guestId: { in: allowed } }, { guestId: userId, hostId: { in: allowed } }] },
      select: { hostId: true, guestId: true },
    }),
  ]);
  const together = new Map<string, number>();
  for (const p of past) {
    const other = p.hostId === userId ? p.guestId : p.hostId;
    together.set(other, (together.get(other) ?? 0) + 1);
  }
  return users
    .map((u) => ({ id: u.id, name: partnerName(u.nickname), together: together.get(u.id) ?? 0, seen: u.lastVisitHour ?? "" }))
    .sort((a, b) => b.together - a.together || b.seen.localeCompare(a.seen) || a.name.localeCompare(b.name))
    .map(({ id, name, together }) => ({ id, name, together }));
}

/** Идущая тренировка человека — для принятия приглашения. */
export async function runningWorkoutId(client: Client, userId: string): Promise<string | null> {
  const w = await client.workout.findFirst({
    where: { userId, status: WorkoutStatus.IN_PROGRESS },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return w?.id ?? null;
}

/** Живое приглашение, где человек — гость (карточка на дашборде). */
export async function pendingInviteFor(userId: string, now: Date): Promise<{ id: string; hostName: string } | null> {
  const s = await openSessionOf(db, userId, now);
  if (!s || s.status !== "INVITED" || s.guestId !== userId) return null;
  const host = await db.user.findUniqueOrThrow({ where: { id: s.hostId }, select: { nickname: true } });
  return { id: s.id, hostName: partnerName(host.nickname) };
}

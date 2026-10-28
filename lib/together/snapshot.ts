import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { settle } from "@/lib/together/queries";
import { buildResponse, type SnapshotResponse } from "@/lib/together/response";

/** Срез партнёра для участника сессии; не участник или нет сессии — null. */
export async function loadPartnerSnapshot(sessionId: string, viewerId: string, since: Date | null, now: Date): Promise<SnapshotResponse | null> {
  const row = await db.trainingSession.findFirst({ where: { id: sessionId, OR: [{ hostId: viewerId }, { guestId: viewerId }] } });
  if (!row) return null;
  const s = await settle(db, row, now);
  const isHost = s.hostId === viewerId;
  const partnerId = isHost ? s.guestId : s.hostId;
  const workoutId = isHost ? s.guestWorkoutId : s.hostWorkoutId;

  const [partner, workout, cheers] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: partnerId }, select: { nickname: true, hideWeights: true } }),
    workoutId
      ? db.workout.findUnique({
          where: { id: workoutId },
          select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            exercises: {
              orderBy: { order: "asc" },
              select: {
                exerciseId: true,
                exercise: { select: { name: true } },
                sets: { orderBy: { order: "asc" }, select: { reps: true, weight: true, completedAt: true } },
              },
            },
          },
        })
      : null,
    since
      ? db.sessionCheer.findMany({ where: { sessionId, fromId: partnerId, createdAt: { gt: since } }, select: { createdAt: true } })
      : [],
  ]);

  const ids = [...new Set(workout?.exercises.map((e) => e.exerciseId) ?? [])];
  const bests = new Map<string, number>();
  if (workoutId && ids.length) {
    const rows = await db.$queryRaw<{ exerciseId: string; best: number }[]>`
      SELECT we."exerciseId", MAX(s.weight)::float AS best
      FROM "WorkoutSet" s
      JOIN "WorkoutExercise" we ON we.id = s."workoutExerciseId"
      JOIN "Workout" w ON w.id = we."workoutId"
      WHERE w."userId" = ${partnerId} AND w.status = 'COMPLETED' AND NOT w."stretchOnly" AND w.id <> ${workoutId}
        AND we."exerciseId" IN (${Prisma.join(ids)})
      GROUP BY we."exerciseId"`;
    for (const r of rows) bests.set(r.exerciseId, r.best);
  }

  return buildResponse({
    session: s,
    viewerId,
    partner,
    workout: workout && {
      status: workout.status,
      startedAt: workout.startedAt,
      finishedAt: workout.finishedAt,
      exercises: workout.exercises.map((e) => ({ name: e.exercise.name, exerciseId: e.exerciseId, sets: e.sets })),
    },
    bests,
    cheers: cheers.map((c) => c.createdAt),
    since,
    now,
  });
}

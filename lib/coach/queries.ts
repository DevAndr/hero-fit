import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getClientWeekPlan } from "@/lib/coach/plan-queries";
import { clientSignals } from "@/lib/coach/signals";
import { getSignalInput } from "@/lib/coach/signals-queries";
import { db } from "@/lib/db";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { clientDisplayName, clientWeek, type ClientRow } from "@/lib/coach/clients";
import { safeTimeZone } from "@/lib/daily-login";
import { levelProgress } from "@/lib/progress/level";
import { decodeCursor, encodeCursor } from "@/lib/social/feed";
import { getProgressionHints } from "@/lib/stats/queries";
import { generateFriendCode, normalizeFriendCode } from "@/lib/social/league";

/** Код приглашения тренера (как код друга: 8 символов, без похожих); создаётся при первом включении режима. */
export async function ensureCoachCode(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { coachCode: true } });
  if (user.coachCode) return user.coachCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Условие coachCode = null — параллельные запросы не перезапишут код друг друга
      await db.user.updateMany({ where: { id: userId, coachCode: null }, data: { coachCode: generateFriendCode() } });
      break;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  const saved = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { coachCode: true } });
  if (!saved.coachCode) throw new Error("Не удалось создать код тренера");
  return saved.coachCode;
}

/** Тренер по коду из ссылки (регистр и дефис не важны); выключенный режим — как неизвестный код. */
export async function getCoachByCode(input: string) {
  const code = normalizeFriendCode(input);
  if (!code) return null;
  return db.user.findFirst({ where: { coachCode: code, isCoach: true }, select: { id: true, nickname: true, name: true } });
}

// ───────────────────────────── Кабинет тренера ─────────────────────────────


const HINT_WINDOW_MS = 30 * 86_400_000;
export const CLIENT_WORKOUTS_PAGE = 20;

/** Активные клиенты тренера для списка: неделя и серия — в поясе клиента. */
export async function getCoachClients(coachId: string, now = new Date()): Promise<ClientRow[]> {
  const links = await db.coachLink.findMany({
    where: { coachId, endedAt: null },
    select: {
      createdAt: true,
      client: {
        select: {
          id: true,
          nickname: true,
          name: true,
          xp: true,
          timeZone: true,
          currentStreak: true,
          lastStreakWeek: true,
          streakFreezes: true,
          weekWorkouts: true,
          weekWorkoutsKey: true,
          freezeGrantedAt: true,
        },
      },
    },
  });
  if (!links.length) return [];
  const ids = links.map((l) => l.client.id);
  const last = await db.workout.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, status: WorkoutStatus.COMPLETED },
    _max: { finishedAt: true },
  });
  const lastBy = new Map(last.map((r) => [r.userId, r._max.finishedAt]));

  return Promise.all(
    links.map(async ({ client: c, createdAt }) => {
      const tz = safeTimeZone(c.timeZone);
      const recent = await db.workoutExercise.findMany({
        where: { workout: { userId: c.id, status: WorkoutStatus.COMPLETED, finishedAt: { gte: new Date(now.getTime() - HINT_WINDOW_MS) } } },
        select: { exerciseId: true },
        distinct: ["exerciseId"],
      });
      const [hints, plan, signalInput] = await Promise.all([
        getProgressionHints(c.id, recent.map((r) => r.exerciseId)),
        getClientWeekPlan(coachId, c.id, tz, now),
        getSignalInput(coachId, c.id, tz, createdAt, now),
      ]);
      return {
        id: c.id,
        name: clientDisplayName(c),
        level: levelProgress(c.xp).level,
        lastWorkoutAt: lastBy.get(c.id) ?? null,
        linkedAt: createdAt,
        ...clientWeek(c, now, tz),
        hints: Object.keys(hints).length,
        timeZone: tz,
        plan,
        signals: clientSignals(signalInput, now, tz).map((s) => s.kind),
      };
    }),
  );
}

/** Завершённые тренировки клиента, новые сверху; курсор — (finishedAt, id), как в ленте. comments — комментарии этого тренера. */
export async function getClientWorkouts(clientId: string, coachId: string, cursor: string | null, limit = CLIENT_WORKOUTS_PAGE) {
  const after = decodeCursor(cursor);
  const rows = await db.workout.findMany({
    where: {
      userId: clientId,
      status: WorkoutStatus.COMPLETED,
      ...(after ? { OR: [{ finishedAt: { lt: after.at } }, { finishedAt: after.at, id: { lt: after.id } }] } : {}),
    },
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      name: true,
      finishedAt: true,
      durationSec: true,
      totalSets: true,
      rpe: true,
      totalVolume: true,
      _count: { select: { exercises: true, comments: { where: { coachId } } } },
    },
  });
  const page = rows.slice(0, limit);
  const lastRow = page.at(-1);
  return {
    workouts: page,
    next: rows.length > limit && lastRow?.finishedAt ? encodeCursor({ finishedAt: lastRow.finishedAt.toISOString(), id: lastRow.id }) : null,
  };
}

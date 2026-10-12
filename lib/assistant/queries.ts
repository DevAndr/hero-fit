import "server-only";
import { WorkoutStatus } from "@/generated/prisma/enums";
import { dayKey } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { addDays } from "@/lib/plans/expand";
import { getCalendar } from "@/lib/plans/queries";
import { ACTIVE_STATUSES } from "@/lib/workouts/queries";

/** По упражнению: завершённые тренировки с ним за 6 недель и дата последнего рекорда (любого типа). */
export async function getStallRows(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 42 * 86_400_000);
  const rows = await db.$queryRaw<{ exerciseId: string; name: string; workouts6w: bigint; lastRecordAt: Date | null }[]>`
    select we."exerciseId", e.name, count(distinct w.id) as "workouts6w",
           (select max(pr."achievedAt") from "PersonalRecord" pr where pr."userId" = ${userId} and pr."exerciseId" = we."exerciseId") as "lastRecordAt"
    from "WorkoutExercise" we
    join "Workout" w on w.id = we."workoutId"
    join "Exercise" e on e.id = we."exerciseId"
    where w."userId" = ${userId} and w.status = ${WorkoutStatus.COMPLETED}::"WorkoutStatus" and w."finishedAt" >= ${since}
    group by we."exerciseId", e.name`;
  return rows.map((r) => ({
    exerciseId: r.exerciseId,
    name: r.name,
    workouts6w: Number(r.workouts6w),
    lastRecordAt: r.lastRecordAt ? r.lastRecordAt.toISOString() : null,
  }));
}

/** Последнее невыполненное вхождение плана за 7 дней (пропущенное намеренно — отменено и сюда не попадает). */
export async function getMissedPlan(userId: string, tz: string, now = new Date()) {
  const today = dayKey(now, tz);
  const [calendar, active] = await Promise.all([
    getCalendar(userId, addDays(today, -7), addDays(today, -1), tz, now),
    db.workout.findFirst({ where: { userId, status: { in: ACTIVE_STATUSES } }, select: { id: true } }),
  ]);
  const missed = calendar.occurrences.filter((o) => o.status === "missed").sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
  return {
    today,
    hasActive: active !== null,
    missed: missed ? { key: missed.key, title: missed.title, date: missed.date, coach: missed.coachId !== null } : null,
  };
}

import "server-only";
import { RecordType, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { levelProgress } from "@/lib/progress/level";
import { bestOfSets, findNewRecords, type RecordValues } from "@/lib/progress/records";
import { applyWorkoutToStreak } from "@/lib/progress/streak";
import { PR_XP, workoutXp } from "@/lib/progress/xp";
import { workoutTotals } from "@/lib/workouts/schema";

export type NewRecord = { exerciseId: string; exerciseName: string; type: RecordType; value: number; previous: number };

/** То, что показывает сводка после тренировки (хранится в meta события WORKOUT_COMPLETED). */
export type FinishMeta = {
  xpBefore: number;
  levelBefore: number;
  levelAfter: number;
  workoutXp: number;
  recordsXp: number;
  records: NewRecord[];
  streak: number;
  streakExtended: boolean;
  streakReset: boolean;
  usedFreezes: number;
};

export type FinishResult = { ok: true } | { ok: false; error: string };

/**
 * Завершение тренировки одной транзакцией: чистим невыполненное, считаем итоги,
 * обновляем рекорды, XP, уровень и streak.
 */
export async function finishWorkout(userId: string, workoutId: string, now = new Date()): Promise<FinishResult> {
  return db.$transaction(async (tx) => {
    const workout = await tx.workout.findFirst({
      where: { id: workoutId, userId },
      include: {
        exercises: { include: { exercise: { select: { name: true } }, sets: true } },
      },
    });
    if (!workout) return { ok: false, error: "Тренировка не найдена" };
    if (workout.status === WorkoutStatus.COMPLETED) return { ok: true }; // повторный клик
    if (workout.status !== WorkoutStatus.IN_PROGRESS || !workout.startedAt) {
      return { ok: false, error: "Сначала начните тренировку" };
    }

    const totals = workoutTotals(workout.exercises);
    if (totals.sets === 0) return { ok: false, error: "Отметьте хотя бы один выполненный подход" };

    // Атомарный «захват»: параллельный запрос заблокируется на строке и после коммита
    // увидит COMPLETED — XP не начислится дважды.
    const claimed = await tx.workout.updateMany({
      where: { id: workoutId, status: WorkoutStatus.IN_PROGRESS },
      data: { status: WorkoutStatus.COMPLETED, finishedAt: now },
    });
    if (claimed.count === 0) return { ok: true };

    // В истории остаются только выполненные подходы и упражнения, где они есть.
    await tx.workoutSet.deleteMany({
      where: { workoutExercise: { workoutId }, OR: [{ completedAt: null }, { reps: { lte: 0 } }] },
    });
    await tx.workoutExercise.deleteMany({ where: { workoutId, sets: { none: {} } } });

    // Личные рекорды
    const records: NewRecord[] = [];
    const byExercise = new Map<string, { name: string; sets: { weight: number; reps: number }[] }>();
    for (const we of workout.exercises) {
      const entry = byExercise.get(we.exerciseId) ?? { name: we.exercise.name, sets: [] };
      entry.sets.push(...we.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0));
      byExercise.set(we.exerciseId, entry);
    }
    for (const [exerciseId, { name, sets }] of byExercise) {
      const current = bestOfSets(sets);
      const existing = await tx.personalRecord.findMany({ where: { userId, exerciseId } });
      const previous: RecordValues = Object.fromEntries(existing.map((r) => [r.type, r.value]));
      const { improved, firstTime } = findNewRecords(current, previous);

      for (const { type, value } of [...improved, ...firstTime]) {
        await tx.personalRecord.upsert({
          where: { userId_exerciseId_type: { userId, exerciseId, type } },
          create: { userId, exerciseId, type, value, achievedAt: now },
          update: { value, achievedAt: now },
        });
      }
      records.push(...improved.map((r) => ({ exerciseId, exerciseName: name, ...r })));
    }

    // XP, уровень, streak
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        xp: true,
        currentStreak: true,
        longestStreak: true,
        lastStreakAt: true,
        streakFreezes: true,
        freezeGrantedAt: true,
      },
    });
    const baseXp = workoutXp(totals);
    const recordsXp = records.length * PR_XP;
    const xpAfter = user.xp + baseXp + recordsXp;
    const streak = applyWorkoutToStreak(user, now);

    const meta: FinishMeta = {
      xpBefore: user.xp,
      levelBefore: levelProgress(user.xp).level,
      levelAfter: levelProgress(xpAfter).level,
      workoutXp: baseXp,
      recordsXp,
      records,
      streak: streak.currentStreak,
      streakExtended: streak.extended,
      streakReset: streak.reset,
      usedFreezes: streak.usedFreezes,
    };

    await tx.workout.update({
      where: { id: workoutId },
      data: {
        status: WorkoutStatus.COMPLETED,
        finishedAt: now,
        durationSec: Math.max(0, Math.round((now.getTime() - workout.startedAt.getTime()) / 1000)),
        totalSets: totals.sets,
        totalReps: totals.reps,
        totalVolume: totals.volume,
        xpEarned: baseXp + recordsXp,
      },
    });

    await tx.xpEvent.create({
      data: { userId, workoutId, amount: baseXp, reason: XpReason.WORKOUT_COMPLETED, meta },
    });
    if (recordsXp > 0) {
      await tx.xpEvent.create({
        data: { userId, workoutId, amount: recordsXp, reason: XpReason.PERSONAL_RECORD, meta: { records } },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        xp: xpAfter,
        level: meta.levelAfter,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastStreakAt: streak.lastStreakAt,
        streakFreezes: streak.streakFreezes,
        freezeGrantedAt: streak.freezeGrantedAt,
      },
    });

    return { ok: true };
  });
}

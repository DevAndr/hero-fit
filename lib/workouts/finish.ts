import "server-only";
import { NotificationType, RecordType, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { evaluateAchievements, type NewAchievement } from "@/lib/achievements/engine";
import { bossName, type BossCode } from "@/lib/boss/bosses";
import { rewardXp, workoutDamage } from "@/lib/boss/damage";
import { getOrCreateBossWeek, weekDamage } from "@/lib/boss/queries";
import { titlesUnlockedByWin } from "@/lib/titles/catalog";
import { notify } from "@/lib/notifications/service";
import { levelProgress } from "@/lib/progress/level";
import { bestOfSets, findNewRecords, type RecordValues } from "@/lib/progress/records";
import { safeTimeZone } from "@/lib/daily-login";
import { countWeekWorkouts } from "@/lib/progress/streak-db";
import { applyWeekCredit, grantFreeze, STREAK_WEEK_TARGET, weekKey } from "@/lib/progress/weekly-streak";
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
  achievementsXp: number;
  records: NewRecord[];
  achievements: NewAchievement[];
  streak: number;
  streakExtended: boolean;
  streakReset: boolean;
  usedFreezes: number;
  /** Тренировок за неделю этой тренировки (включая её). */
  weekCount: number;
  /** Босс недели этой тренировки: урон, оставшееся HP до/после, победа этой тренировкой. */
  boss?: {
    week: string;
    code: string;
    damage: number;
    crits: number;
    hpBefore: number;
    hpAfter: number;
    hp: number;
    defeated: boolean;
    /** Титулы, открытые этой победой (названия). */
    titles?: string[];
  };
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
        lastStreakWeek: true,
        streakFreezes: true,
        freezeGrantedAt: true,
        weekWorkoutsKey: true,
        timeZone: true,
      },
    });
    const baseXp = workoutXp(totals);
    const recordsXp = records.length * PR_XP;
    const xpAfter = user.xp + baseXp + recordsXp;

    // Недельный streak: тренировка уже COMPLETED (захват выше) — считаем неделю вместе с ней.
    const tz = safeTimeZone(user.timeZone);
    const week = weekKey(now, tz);
    const weekCount = await countWeekWorkouts(tx, userId, week, tz);
    const withFreeze = grantFreeze(user, now);
    const streak =
      weekCount >= STREAK_WEEK_TARGET
        ? applyWeekCredit(withFreeze, week)
        : { ...withFreeze, frozenWeeks: [], extended: false, reset: false };
    if (streak.frozenWeeks.length) {
      await tx.streakCoverWeek.createMany({
        data: streak.frozenWeeks.map((w) => ({ userId, week: w, reason: "FREEZE" as const })),
        skipDuplicates: true,
      });
    }
    // Тренировка задним числом (офлайн) не портит счётчик уже начавшейся следующей недели.
    const weekCounter = !user.weekWorkoutsKey || week >= user.weekWorkoutsKey ? { weekWorkouts: weekCount, weekWorkoutsKey: week } : {};

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

    await tx.user.update({
      where: { id: userId },
      data: {
        xp: xpAfter,
        level: levelProgress(xpAfter).level,
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
        lastStreakWeek: streak.lastStreakWeek,
        streakFreezes: streak.streakFreezes,
        freezeGrantedAt: streak.freezeGrantedAt,
        ...weekCounter,
      },
    });

    // Босс недели этой тренировки (неделя — по её finishedAt): урон прошлых тренировок недели + этой
    const bossWeek = await getOrCreateBossWeek(tx, userId, week, tz);
    const before = await weekDamage(tx, userId, week, tz, workoutId);
    const hit = workoutDamage(
      workout.exercises.flatMap((we) => we.sets.filter((s) => s.completedAt && !s.isWarmup && s.reps > 0)),
      new Set(records.map((r) => r.exerciseId)).size,
    );
    let defeated = false;
    if (before.damage + hit.damage >= bossWeek.hp) {
      // Условие по defeatedAt — повтор или параллельная тренировка не засчитают победу дважды
      const { count } = await tx.bossWeek.updateMany({ where: { id: bossWeek.id, defeatedAt: null }, data: { defeatedAt: now } });
      defeated = count === 1;
    }
    if (defeated) {
      const prefs = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { notifyAchievements: true } });
      await notify(
        tx,
        userId,
        {
          type: NotificationType.BOSS,
          title: `⚔ Босс повержен: ${bossName(bossWeek.bossCode)}`,
          // Сводка победной тренировки: сундук там есть и после смены недели (дашборд показывает уже нового босса)
          body: `Сундук ждёт в сводке тренировки · +${rewardXp(bossWeek.hp)} XP`,
          url: `/workouts/${workoutId}`,
        },
        { push: prefs.notifyAchievements },
      );
    }
    let titles: string[] = [];
    if (defeated) {
      // Победы до этой: текущая неделя уже помечена — исключаем её
      const wins = await tx.bossWeek.groupBy({
        by: ["bossCode"],
        where: { userId, defeatedAt: { not: null }, id: { not: bossWeek.id } },
        _count: { _all: true },
      });
      const winsBefore = Object.fromEntries(wins.map((w) => [w.bossCode, w._count._all]));
      titles = titlesUnlockedByWin(winsBefore, bossWeek.bossCode as BossCode).map((t) => t.label);
    }
    const boss: FinishMeta["boss"] = {
      week,
      code: bossWeek.bossCode,
      damage: hit.damage,
      crits: hit.crits,
      hpBefore: Math.max(0, bossWeek.hp - before.damage),
      hpAfter: Math.max(0, bossWeek.hp - before.damage - hit.damage),
      hp: bossWeek.hp,
      defeated,
      ...(titles.length ? { titles } : {}),
    };

    // Ачивки считаются по уже обновлённым данным (новая тренировка, streak, босс) и сами начисляют свой XP.
    const unlocked = await evaluateAchievements(tx, userId);

    const meta: FinishMeta = {
      xpBefore: user.xp,
      levelBefore: levelProgress(user.xp).level,
      levelAfter: levelProgress(xpAfter + unlocked.xp).level,
      workoutXp: baseXp,
      recordsXp,
      achievementsXp: unlocked.xp,
      records,
      achievements: unlocked.achievements,
      streak: streak.currentStreak,
      streakExtended: streak.extended,
      streakReset: streak.reset,
      usedFreezes: streak.frozenWeeks.length,
      weekCount,
      boss,
    };

    await tx.xpEvent.create({
      data: { userId, workoutId, amount: baseXp, reason: XpReason.WORKOUT_COMPLETED, meta },
    });
    if (recordsXp > 0) {
      await tx.xpEvent.create({
        data: { userId, workoutId, amount: recordsXp, reason: XpReason.PERSONAL_RECORD, meta: { records } },
      });
    }

    return { ok: true };
  }, { timeout: 15_000 });
}

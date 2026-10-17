import "server-only";
import { NotificationType, RecordType, WorkoutStatus, XpReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { evaluateAchievements, type NewAchievement } from "@/lib/achievements/engine";
import { bossName, type BossCode } from "@/lib/boss/bosses";
import { rewardXp, workoutDamage } from "@/lib/boss/damage";
import { getOrCreateBossWeek, weekDamage } from "@/lib/boss/queries";
import { goblinProgress } from "@/lib/goblin/rules";
import { applyRaidHit } from "@/lib/raid/apply";
import { applyClubTasks, type FinishClubTask } from "@/lib/club/tasks-apply";
import { applyGoals, snapshotGoals } from "@/lib/goals/apply";
import type { FinishGoals } from "@/lib/goals/rules";
import { titlesUnlockedByWin } from "@/lib/titles/catalog";
import { notifyCoachOnFinish } from "@/lib/coach/finish-notify";
import type { ProgressionItem } from "@/lib/coach/progression";
import { applyProgression } from "@/lib/coach/progression-apply";
import { applyOwnProgression } from "@/lib/progress/own-progression";
import { notify } from "@/lib/notifications/service";
import { levelProgress } from "@/lib/progress/level";
import { bestOfSets, findNewRecords, type RecordValues } from "@/lib/progress/records";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { workoutCoinGrants, type CoinLine } from "@/lib/shop/coins";
import { grantCoinsDetailed } from "@/lib/shop/coins-db";
import { paidWorkoutsToday, toLines } from "@/lib/shop/earn";
import { countWeekWorkouts } from "@/lib/progress/streak-db";
import { applyWeekCredit, grantFreeze, STREAK_WEEK_TARGET, weekKey } from "@/lib/progress/weekly-streak";
import { PR_XP, workoutXp } from "@/lib/progress/xp";
import { workoutTotals } from "@/lib/workouts/schema";
import { isDoneSet, type ExerciseKindName } from "@/lib/workouts/kinds";

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
  /** Прогрессия по этой тренировке — заданий тренера или своего шаблона (нет — поля нет). */
  progression?: ProgressionItem[];
  /** Чья прогрессия: own — свой шаблон; нет поля — тренера (и в старых записях). */
  progressionSource?: "own";
  /** Неделя программы тренера на несколько недель («Неделя 3/8»): вес ведёт программа, прогрессии нет. */
  program?: string;
  /** Программа из каталога (её название): блок сводки — «Программа «…»» вместо «План тренера». */
  programName?: string;
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
  /** Золотой гоблин этой тренировки (флаг golden_goblin): пойман ли — сундук в итогах. */
  goblin?: { id: string; caught: boolean };
  /** Рейд-босс гильдии: урон этой тренировки, HP до/после, победа; rewardXp — моя награда, если победа дала сундук. */
  raid?: {
    raidId: string;
    code: string;
    name: string;
    damage: number;
    hpBefore: number;
    hpAfter: number;
    hp: number;
    defeated: boolean;
    rewardXp?: number;
  };
  /** Личные цели: выполненные этой тренировкой и продвинутые ею (нет — поля нет). */
  goals?: FinishGoals;
  /** Задания клуба: вклад этой тренировки и выполнение (нет — поля нет). */
  clubTasks?: FinishClubTask[];
  /** Монеты этой тренировки: тренировка, рекорды, неделя серии, уровни, ачивки (нет — поля нет). */
  coins?: { total: number; items: CoinLine[] };
};

export type FinishResult = { ok: true } | { ok: false; error: string };

/**
 * Завершение тренировки одной транзакцией: чистим невыполненное, считаем итоги,
 * обновляем рекорды, XP, уровень и streak.
 */
export async function finishWorkout(
  userId: string,
  workoutId: string,
  now = new Date(),
  opts: { goblin?: boolean } = {},
): Promise<FinishResult> {
  return db.$transaction(async (tx) => {
    const workout = await tx.workout.findFirst({
      where: { id: workoutId, userId },
      include: {
        exercises: { include: { exercise: { select: { name: true, isBodyweight: true, kind: true } }, sets: true } },
      },
    });
    if (!workout) return { ok: false, error: "Тренировка не найдена" };
    if (workout.status === WorkoutStatus.COMPLETED) return { ok: true }; // повторный клик
    if (workout.status !== WorkoutStatus.IN_PROGRESS || !workout.startedAt) {
      return { ok: false, error: "Сначала начните тренировку" };
    }

    const totals = workoutTotals(workout.exercises.map((we) => ({ kind: we.exercise.kind, sets: we.sets })));
    if (totals.sets === 0) return { ok: false, error: "Отметьте хотя бы один выполненный подход" };

    // Цели — значения до тренировки (до захвата и рекордов): для строк прироста в сводке
    const goalSnapshot = await snapshotGoals(tx, userId);

    // Атомарный «захват»: параллельный запрос заблокируется на строке и после коммита
    // увидит COMPLETED — XP не начислится дважды.
    const claimed = await tx.workout.updateMany({
      where: { id: workoutId, status: WorkoutStatus.IN_PROGRESS },
      data: { status: WorkoutStatus.COMPLETED, finishedAt: now },
    });
    if (claimed.count === 0) return { ok: true };

    // В истории остаются только выполненные подходы и упражнения, где они есть.
    await tx.workoutSet.deleteMany({
      // Подход «состоялся»: силовой — с повторами, на время и кардио — со временем
      where: {
        workoutExercise: { workoutId },
        OR: [
          { completedAt: null },
          { reps: { lte: 0 }, OR: [{ durationSec: null }, { durationSec: { lte: 0 } }] },
          // На время и кардио повторы не в счёт: без времени подход не состоялся
          { workoutExercise: { exercise: { kind: { not: "REPS" } } }, OR: [{ durationSec: null }, { durationSec: { lte: 0 } }] },
        ],
      },
    });
    await tx.workoutExercise.deleteMany({ where: { workoutId, sets: { none: {} } } });

    // Прогрессия: сравниваем выполненное с целью (невыполненные подходы уже удалены). Шаблон либо свой, либо тренера
    const progression = await applyProgression(tx, userId, workout);
    const ownProgression = await applyOwnProgression(tx, userId, workout);

    // Личные рекорды
    const records: NewRecord[] = [];
    const byExercise = new Map<string, { name: string; kind: ExerciseKindName; sets: { weight: number; reps: number; durationSec: number | null; distanceM: number | null }[] }>();
    for (const we of workout.exercises) {
      const entry = byExercise.get(we.exerciseId) ?? { name: we.exercise.name, kind: we.exercise.kind, sets: [] };
      entry.sets.push(...we.sets.filter((s) => !s.isWarmup && isDoneSet(we.exercise.kind, s)));
      byExercise.set(we.exerciseId, entry);
    }
    for (const [exerciseId, { name, kind, sets }] of byExercise) {
      const current = bestOfSets(sets, kind);
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

    // Монеты: строка пользователя заблокирована UPDATE выше — лимит «2 тренировки в день» не обойти гонкой двух финишей.
    // День — местный день finishedAt (офлайн-финиш задним числом считается по своему дню).
    const workingSets = workout.exercises.reduce((n, we) => n + we.sets.filter((s) => !s.isWarmup && isDoneSet(we.exercise.kind, s)).length, 0);
    const day = dayKey(now, tz);
    const levelBefore = levelProgress(user.xp).level;
    const coinGrants = await grantCoinsDetailed(
      tx,
      userId,
      workoutCoinGrants({
        workoutId,
        day,
        workingSets,
        paidToday: await paidWorkoutsToday(tx, userId, day),
        records,
        streakWeek: streak.extended ? week : null,
        streak: streak.currentStreak,
        levelBefore,
        levelAfter: levelProgress(xpAfter).level,
      }),
    );

    // Босс недели этой тренировки (неделя — по её finishedAt): урон прошлых тренировок недели + этой
    const bossWeek = await getOrCreateBossWeek(tx, userId, week, tz);
    const before = await weekDamage(tx, userId, week, tz, workoutId);
    const hit = workoutDamage(
      workout.exercises.flatMap((we) => we.sets.filter((s) => !s.isWarmup && isDoneSet(we.exercise.kind, s))),
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

    // Золотой гоблин: 3 рабочих подхода за 10 минут с появления — пойман (условие по caughtAt — без повторов)
    let goblin: FinishMeta["goblin"];
    if (opts.goblin) {
      const encounter = await tx.goblinEncounter.findUnique({ where: { workoutId }, select: { id: true, spawnedAt: true, caughtAt: true } });
      if (encounter) {
        const { caught } = goblinProgress(encounter.spawnedAt, workout.exercises.flatMap((e) => e.sets), now);
        if (caught && !encounter.caughtAt) {
          await tx.goblinEncounter.updateMany({ where: { id: encounter.id, caughtAt: null }, data: { caughtAt: now } });
        }
        goblin = { id: encounter.id, caught: caught || Boolean(encounter.caughtAt) };
      }
    }

    // Рейд гильдии — тем же уроном; окно рейда — по реальному времени (офлайн-финиш прошлой недели не бьёт)
    const raid = await applyRaidHit(tx, { userId, workoutId, finishedAt: now, damage: hit.damage, crits: hit.crits, now: new Date() });

    // Задания клуба — вклад этой тренировки (только выполненные рабочие подходы); новые сундуки учтёт evaluateAchievements ниже
    const clubTasks = await applyClubTasks(tx, {
      userId,
      workoutId,
      finishedAt: now,
      now: new Date(),
      workout: {
        totalVolume: totals.volume,
        durationSec: Math.max(0, Math.round((now.getTime() - workout.startedAt.getTime()) / 1000)),
        exercises: workout.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets })),
      },
    });

    // Цели — после рекордов и серии; выполненные учтёт evaluateAchievements ниже
    const goals = await applyGoals(tx, userId, now, goalSnapshot);

    // Ачивки считаются по уже обновлённым данным (новая тренировка, streak, босс) и сами начисляют свой XP.
    // Своя тренировка не двигает лестницы тренера — их SQL в транзакции завершения не нужен
    const unlocked = await evaluateAchievements(tx, userId, { coach: false });

    const coinItems = toLines([...coinGrants, ...unlocked.coins]);
    const coinTotal = coinItems.reduce((n, c) => n + c.amount, 0);

    const meta: FinishMeta = {
      xpBefore: user.xp,
      levelBefore,
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
      ...(goblin ? { goblin } : {}),
      ...(raid ? { raid } : {}),
      ...(goals ? { goals } : {}),
      ...(clubTasks ? { clubTasks } : {}),
      ...(coinTotal > 0 ? { coins: { total: coinTotal, items: coinItems } } : {}),
      ...(progression.items.length ? { progression: progression.items } : {}),
      ...(progression.program ? { program: progression.program } : {}),
      ...(progression.programName ? { programName: progression.programName } : {}),
      ...(ownProgression.length ? { progression: ownProgression, progressionSource: "own" as const } : {}),
    };

    await tx.xpEvent.create({
      data: { userId, workoutId, amount: baseXp, reason: XpReason.WORKOUT_COMPLETED, meta },
    });
    if (recordsXp > 0) {
      await tx.xpEvent.create({
        data: { userId, workoutId, amount: recordsXp, reason: XpReason.PERSONAL_RECORD, meta: { records } },
      });
    }
    await notifyCoachOnFinish(tx, userId, workout);

    return { ok: true };
  }, { timeout: 15_000 });
}

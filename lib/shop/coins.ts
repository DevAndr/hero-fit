import type { Prisma } from "@/generated/prisma/client";
import type { CoinReason } from "@/generated/prisma/enums";
import { levelProgress } from "@/lib/progress/level";

/** Ставки монет (спека 2026-10-13-cosmetics-shop). Чистые функции — без server-only, их читает и клиент. */
export const COIN_RATES = {
  workout: 10,
  workoutsPerDay: 2,
  minWorkingSets: 3,
  record: 5,
  recordsPerWorkout: 3,
  dailyChest: 2,
  dailyChestRare: 6,
  bossChest: 30,
  raidChest: 40,
  raidChestMvp: 60,
  goalChest: 25,
  clubTaskChest: 15,
  goblinChest: 40,
  /** Ачивка: XP / делитель, в пределах от минимума до максимума. */
  achievementDivisor: 5,
  achievementMin: 3,
  achievementMax: 50,
  /** Неделя серии: база + шаг × длина серии, не больше потолка. */
  streakWeekBase: 10,
  streakWeekStep: 2,
  streakWeekMax: 30,
  /** Новый уровень N: база + шаг × N. */
  levelBase: 20,
  levelStep: 2,
  retroCap: 3000,
} as const;

/** Тренировка: от 3 выполненных рабочих подходов, оплачиваются не больше 2 тренировок за местный день. */
export function workoutCoins(workingSets: number, paidToday: number): number {
  if (workingSets < COIN_RATES.minWorkingSets || paidToday >= COIN_RATES.workoutsPerDay) return 0;
  return COIN_RATES.workout;
}

/** Побитые рекорды: за упражнение, до 3 на тренировку. */
export function recordCoins(recordExercises: number): number {
  return Math.min(Math.max(recordExercises, 0), COIN_RATES.recordsPerWorkout) * COIN_RATES.record;
}

/** Ачивка: XP / 5, от 3 до 50. */
export function achievementCoins(xpReward: number): number {
  return Math.min(COIN_RATES.achievementMax, Math.max(COIN_RATES.achievementMin, Math.round(xpReward / COIN_RATES.achievementDivisor)));
}

/** Засчитанная неделя серии: 10 + 2 × длина серии, не больше 30. */
export function streakWeekCoins(streak: number): number {
  return Math.min(COIN_RATES.streakWeekMax, COIN_RATES.streakWeekBase + COIN_RATES.streakWeekStep * streak);
}

/** Новый уровень: 20 + 2 × N. */
export function levelCoins(level: number): number {
  return COIN_RATES.levelBase + COIN_RATES.levelStep * level;
}

/** Монеты за каждый достигнутый уровень между `levelBefore` (не включая) и `levelAfter`. */
export function levelUpCoins(levelBefore: number, levelAfter: number): { level: number; amount: number }[] {
  const out: { level: number; amount: number }[] = [];
  for (let level = levelBefore + 1; level <= levelAfter; level++) out.push({ level, amount: levelCoins(level) });
  return out;
}

/** Начисление: `key` делает его идемпотентным, `label` — подпись для сводки (в журнал не пишется). */
export type CoinGrant = { reason: CoinReason; key: string; amount: number; meta?: Prisma.InputJsonValue; label?: string };

/** Строка «+N монет» в сводке тренировки. */
export type CoinLine = { reason: CoinReason; amount: number; label: string };

/** Монеты за уровни между двумя значениями XP: ключ `level:<N>` — повтор уровня монет не даёт. */
export function levelUpGrants(xpBefore: number, xpAfter: number): CoinGrant[] {
  return levelUpCoins(levelProgress(xpBefore).level, levelProgress(xpAfter).level).map(({ level, amount }) => ({
    reason: "LEVEL_UP" as const,
    key: `level:${level}`,
    amount,
    label: `Уровень ${level}`,
  }));
}

export type WorkoutCoinInput = {
  workoutId: string;
  /** Местный день завершения (YYYY-MM-DD). */
  day: string;
  workingSets: number;
  /** Сколько тренировок этого дня уже оплачено. */
  paidToday: number;
  records: { exerciseId: string; exerciseName: string }[];
  /** Ключ недели, если она засчитана этой тренировкой (3+ тренировок), иначе null. */
  streakWeek: string | null;
  streak: number;
  levelBefore: number;
  levelAfter: number;
  /** Сессия растяжки: без монет за тренировку (лимит дня не тратится); рекорды и уровни — как обычно. */
  stretchOnly?: boolean;
};

/** Монеты за завершённую тренировку: сама тренировка, рекорды, неделя серии, уровни. */
export function workoutCoinGrants(input: WorkoutCoinInput): CoinGrant[] {
  const out: CoinGrant[] = [];
  const workout = input.stretchOnly ? 0 : workoutCoins(input.workingSets, input.paidToday);
  if (workout > 0) {
    out.push({ reason: "WORKOUT", key: `workout:${input.workoutId}`, amount: workout, meta: { day: input.day }, label: "Тренировка" });
  }
  const seen = new Set<string>();
  const exercises = input.records.filter((r) => !seen.has(r.exerciseId) && seen.add(r.exerciseId));
  for (const r of exercises.slice(0, COIN_RATES.recordsPerWorkout)) {
    out.push({ reason: "RECORD", key: `record:${input.workoutId}:${r.exerciseId}`, amount: COIN_RATES.record, meta: { exercise: r.exerciseName }, label: `Рекорд: ${r.exerciseName}` });
  }
  if (input.streakWeek) {
    out.push({ reason: "STREAK_WEEK", key: `streakw:${input.streakWeek}`, amount: streakWeekCoins(input.streak), label: "Неделя серии" });
  }
  for (const { level, amount } of levelUpCoins(input.levelBefore, input.levelAfter)) {
    out.push({ reason: "LEVEL_UP", key: `level:${level}`, amount, label: `Уровень ${level}` });
  }
  return out;
}

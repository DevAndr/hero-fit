import type { RecordType } from "@/generated/prisma/enums";
import { formatClock, formatKm, type ExerciseKindName } from "@/lib/workouts/kinds";

export type RecordValues = Partial<Record<RecordType, number>>;

/** Расчётный 1RM по формуле Эпли: вес × (1 + повторы/30); для одного повтора — сам вес. */
export function epley1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

/** Подход кардио идёт в «Лучший темп» с этой дистанции. */
export const PACE_MIN_M = 1000;

/** Рекорды, где меньше — лучше. */
export const LOWER_IS_BETTER: ReadonlySet<RecordType> = new Set<RecordType>(["BEST_PACE"]);

type RecordSet = { weight: number; reps: number; durationSec?: number | null; distanceM?: number | null };

/**
 * Лучшие значения по подходам. Силовые — 1RM, вес, повторы; на время — самый долгий подход;
 * кардио — дистанция, время и темп (с/км, от 1 км).
 */
export function bestOfSets(sets: RecordSet[], kind: ExerciseKindName = "REPS"): RecordValues {
  if (kind !== "REPS") return bestOfTimed(sets, kind);
  const best: RecordValues = {};
  for (const { weight, reps } of sets) {
    if (reps <= 0) continue;
    best.MAX_REPS = Math.max(best.MAX_REPS ?? 0, reps);
    if (weight > 0) {
      best.MAX_WEIGHT = Math.max(best.MAX_WEIGHT ?? 0, weight);
      best.ONE_RM = Math.max(best.ONE_RM ?? 0, epley1RM(weight, reps));
    }
  }
  return best;
}

function bestOfTimed(sets: RecordSet[], kind: ExerciseKindName): RecordValues {
  const best: RecordValues = {};
  for (const { durationSec, distanceM } of sets) {
    const sec = durationSec ?? 0;
    if (sec <= 0) continue;
    best.MAX_DURATION = Math.max(best.MAX_DURATION ?? 0, sec);
    if (kind !== "CARDIO" || !distanceM) continue;
    best.MAX_DISTANCE = Math.max(best.MAX_DISTANCE ?? 0, distanceM);
    if (distanceM >= PACE_MIN_M) {
      const pace = sec / (distanceM / 1000);
      best.BEST_PACE = Math.min(best.BEST_PACE ?? Infinity, pace);
    }
  }
  return best;
}

/** Значение рекорда для показа: «102,5 кг», «12», «1:35», «5,2 км», «5:31/км». */
export function formatRecord(type: RecordType, value: number): string {
  switch (type) {
    case "MAX_DURATION":
      return formatClock(value);
    case "MAX_DISTANCE":
      return formatKm(value);
    case "BEST_PACE":
      return `${formatClock(value)}/км`;
    case "MAX_REPS":
      return String(Math.round(value));
    default:
      return `${(Math.round(value * 10) / 10).toLocaleString("ru-RU")} кг`;
  }
}

export function findNewRecords(current: RecordValues, previous: RecordValues) {
  const improved: { type: RecordType; value: number; previous: number }[] = [];
  const firstTime: { type: RecordType; value: number }[] = [];

  for (const [type, value] of Object.entries(current) as [RecordType, number][]) {
    const prev = previous[type];
    if (prev === undefined) firstTime.push({ type, value });
    else if (LOWER_IS_BETTER.has(type) ? value < prev - 1e-9 : value > prev + 1e-9) improved.push({ type, value, previous: prev });
  }
  return { improved, firstTime };
}

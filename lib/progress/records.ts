import type { RecordType } from "@/generated/prisma/enums";

export type RecordValues = Partial<Record<RecordType, number>>;

/** Расчётный 1RM по формуле Эпли: вес × (1 + повторы/30); для одного повтора — сам вес. */
export function epley1RM(weight: number, reps: number) {
  if (weight <= 0 || reps <= 0) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function bestOfSets(sets: { weight: number; reps: number }[]): RecordValues {
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

export function findNewRecords(current: RecordValues, previous: RecordValues) {
  const improved: { type: RecordType; value: number; previous: number }[] = [];
  const firstTime: { type: RecordType; value: number }[] = [];

  for (const [type, value] of Object.entries(current) as [RecordType, number][]) {
    const prev = previous[type];
    if (prev === undefined) firstTime.push({ type, value });
    else if (value > prev + 1e-9) improved.push({ type, value, previous: prev });
  }
  return { improved, firstTime };
}

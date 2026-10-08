import type { MuscleGroup } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { MUSCLE_GROUP_LABELS, MUSCLE_GROUPS } from "@/lib/muscle-groups";

/** Баланс нагрузки за 30 дней: подходы на группу (основная группа упражнения — 1, второстепенные — 0,5). */
export const BALANCE_DAYS = 30;
/** Перекос в паре: у большей группы не меньше стольких подходов и вдвое больше, чем у меньшей. */
const MIN_SETS = 6;
const MIN_RATIO = 2;

/** Мышцы-антагонисты. */
const PAIRS: [MuscleGroup, MuscleGroup][] = [
  ["CHEST", "BACK"],
  ["BICEPS", "TRICEPS"],
];
const DATIVE: Partial<Record<MuscleGroup, string>> = { CHEST: "груди", BACK: "спине", BICEPS: "бицепсу", TRICEPS: "трицепсу" };
const ADVICE: Partial<Record<MuscleGroup, string>> = {
  CHEST: "добавьте жимы",
  BACK: "добавьте тяги",
  BICEPS: "добавьте сгибания на бицепс",
  TRICEPS: "добавьте разгибания на трицепс",
};

export type GroupBalance = { group: MuscleGroup; sets: number; /** 0 — ни разу, 1…4 — доля от самой нагруженной */ level: number };
export type Imbalance = { more: MuscleGroup; less: MuscleGroup; moreSets: number; lessSets: number };

export function muscleBalance(rows: { group: MuscleGroup; sets: number }[]) {
  const sets = new Map(rows.map((r) => [r.group, r.sets]));
  const max = Math.max(0, ...rows.map((r) => r.sets));
  const groups: GroupBalance[] = MUSCLE_GROUPS.map((group) => {
    const n = sets.get(group) ?? 0;
    return { group, sets: n, level: n > 0 ? Math.min(4, Math.max(1, Math.ceil((n / max) * 4))) : 0 };
  });
  const imbalances: Imbalance[] = [];
  for (const [a, b] of PAIRS) {
    const [more, less] = (sets.get(a) ?? 0) >= (sets.get(b) ?? 0) ? [a, b] : [b, a];
    const moreSets = sets.get(more) ?? 0;
    const lessSets = sets.get(less) ?? 0;
    if (moreSets >= MIN_SETS && moreSets >= lessSets * MIN_RATIO) imbalances.push({ more, less, moreSets, lessSets });
  }
  return { groups, imbalances, untouched: groups.filter((g) => g.sets === 0).map((g) => g.group) };
}

const num = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });

export function imbalanceHint({ more, less, moreSets, lessSets }: Imbalance) {
  const advice = ADVICE[less];
  if (lessSets === 0) {
    return `${MUSCLE_GROUP_LABELS[more]}: ${num(moreSets)} ${plural(Math.round(moreSets), "подход", "подхода", "подходов")}, ${MUSCLE_GROUP_LABELS[less].toLowerCase()} — ни одного — ${advice}`;
  }
  return `${MUSCLE_GROUP_LABELS[more]} ×${num(Math.round((moreSets / lessSets) * 10) / 10)} к ${DATIVE[less]} — ${advice}`;
}

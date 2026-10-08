import type { MuscleGroup } from "@/generated/prisma/enums";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { NEGLECT_DAYS, type GroupRecovery } from "@/lib/progress/recovery";

/** «Собрать по восстановлению»: 4–6 упражнений на группы, которые можно нагружать или давно не тренировали. */
export const MAX_EXERCISES = 6;
const BIG_GROUPS = new Set<MuscleGroup>(["LEGS", "BACK", "CHEST"]);

export type PlanCandidate = {
  id: string;
  name: string;
  /** Первая — основная. */
  muscleGroups: MuscleGroup[];
  /** Сколько тренировок с упражнением за последние 90 дней. */
  uses: number;
  /** Порядок в справочнике (для упражнений без истории). */
  order: number;
  restSec: number;
};

export function planRecoveryWorkout<C extends PlanCandidate>(recovery: GroupRecovery[], candidates: C[]) {
  const fatigued = new Set(recovery.filter((r) => r.state === "fatigued").map((r) => r.group));
  // Дольше отдыхает — раньше; ни разу не тренированные — как «неделя отдыха». Сортировка устойчивая.
  const targets = recovery
    .filter((r) => r.state === "ready" || r.state === "neglected")
    .sort((a, b) => (b.daysSince ?? NEGLECT_DAYS) - (a.daysSince ?? NEGLECT_DAYS));
  const ranked = [...candidates].sort((a, b) => b.uses - a.uses || a.order - b.order);

  const groups: MuscleGroup[] = [];
  const exercises: C[] = [];
  const taken = new Set<string>();
  for (const { group } of targets) {
    if (exercises.length >= MAX_EXERCISES) break;
    const quota = Math.min(BIG_GROUPS.has(group) ? 2 : 1, MAX_EXERCISES - exercises.length);
    const picked = ranked
      .filter((c) => c.muscleGroups[0] === group && !taken.has(c.id) && !c.muscleGroups.slice(1).some((g) => fatigued.has(g)))
      .slice(0, quota);
    if (!picked.length) continue;
    groups.push(group);
    for (const c of picked) {
      taken.add(c.id);
      exercises.push(c);
    }
  }
  return { groups, exercises };
}

export function recoveryWorkoutName(groups: MuscleGroup[]) {
  return `По восстановлению: ${groups.map((g) => MUSCLE_GROUP_LABELS[g].toLowerCase()).join(", ")}`;
}

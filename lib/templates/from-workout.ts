import { normalizeGroups } from "@/lib/workouts/supersets";

type WorkoutExerciseWithSets = {
  exerciseId: string;
  restSec: number;
  supersetGroup?: number | null;
  sets: { weight: number; reps: number }[];
};

/** Упражнения тренировки → цели шаблона: число рабочих подходов и последний вес/повторы. */
export function templateItemsFromWorkout(exercises: WorkoutExerciseWithSets[]) {
  const groups = normalizeGroups(exercises.map((we) => ({ group: we.supersetGroup ?? null })));
  return exercises.map((we, order) => {
    const last = we.sets.at(-1);
    return {
      exerciseId: we.exerciseId,
      order,
      restSec: we.restSec,
      supersetGroup: groups[order].group,
      targetSets: Math.max(1, we.sets.length),
      targetReps: last?.reps || null,
      targetWeight: last?.weight || null,
    };
  });
}

/** Отличается ли состав тренировки от её шаблона (упражнения, порядок, число рабочих подходов, суперсеты). */
export function differsFromTemplate(
  workoutExercises: { exerciseId: string; supersetGroup?: number | null; sets: { isWarmup: boolean }[] }[],
  templateExercises: { exerciseId: string; supersetGroup?: number | null; targetSets: number }[],
) {
  const signature = (items: { id: string; sets: number; group?: number | null }[]) => {
    const groups = normalizeGroups(items.map((i) => ({ group: i.group ?? null })));
    return items.map((i, k) => `${i.id}:${i.sets}:${groups[k].group ?? "-"}`).join("|");
  };
  return (
    signature(workoutExercises.map((e) => ({ id: e.exerciseId, sets: e.sets.filter((s) => !s.isWarmup).length, group: e.supersetGroup }))) !==
    signature(templateExercises.map((e) => ({ id: e.exerciseId, sets: e.targetSets, group: e.supersetGroup })))
  );
}

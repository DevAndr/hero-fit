type WorkoutExerciseWithSets = {
  exerciseId: string;
  restSec: number;
  sets: { weight: number; reps: number }[];
};

/** Упражнения тренировки → цели шаблона: число рабочих подходов и последний вес/повторы. */
export function templateItemsFromWorkout(exercises: WorkoutExerciseWithSets[]) {
  return exercises.map((we, order) => {
    const last = we.sets.at(-1);
    return {
      exerciseId: we.exerciseId,
      order,
      restSec: we.restSec,
      targetSets: Math.max(1, we.sets.length),
      targetReps: last?.reps || null,
      targetWeight: last?.weight || null,
    };
  });
}

/** Отличается ли состав тренировки от её шаблона (упражнения, порядок, число рабочих подходов). */
export function differsFromTemplate(
  workoutExercises: { exerciseId: string; sets: { isWarmup: boolean }[] }[],
  templateExercises: { exerciseId: string; targetSets: number }[],
) {
  const signature = (items: { id: string; sets: number }[]) => items.map((i) => `${i.id}:${i.sets}`).join("|");
  return (
    signature(workoutExercises.map((e) => ({ id: e.exerciseId, sets: e.sets.filter((s) => !s.isWarmup).length }))) !==
    signature(templateExercises.map((e) => ({ id: e.exerciseId, sets: e.targetSets })))
  );
}

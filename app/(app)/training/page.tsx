import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { StartScreen } from "@/components/training/start-screen";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { requireUser } from "@/lib/auth/dal";
import { listExercises } from "@/lib/exercises/queries";
import { getActiveWorkout, getLastPerformance, getStartOptions } from "@/lib/workouts/queries";

export const metadata: Metadata = { title: "Тренировка" };

export default async function TrainingPage() {
  const user = await requireUser();
  const workout = await getActiveWorkout(user.id);

  if (!workout) {
    const options = await getStartOptions(user.id);
    return (
      <>
        <PageHeader title="Новая тренировка" description="Начните с нуля, с шаблона или повторите прошлую" />
        <StartScreen {...options} />
      </>
    );
  }

  const exercises = await listExercises(user.id);
  const last = await getLastPerformance(
    user.id,
    [...new Set([...exercises.map((e) => e.id), ...workout.exercises.map((e) => e.exercise.id)])],
  );

  // key: после отмены/новой тренировки редактор монтируется с чистым состоянием.
  return <WorkoutEditor key={workout.id} workout={workout} exercises={exercises} last={last} />;
}

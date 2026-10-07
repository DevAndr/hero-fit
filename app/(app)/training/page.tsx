import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { OfflineCleanup } from "@/components/training/offline-cleanup";
import { StartScreen } from "@/components/training/start-screen";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { requireUser } from "@/lib/auth/dal";
import { listExercises } from "@/lib/exercises/queries";
import { getProgressionHints } from "@/lib/stats/queries";
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
        <OfflineCleanup />
      </>
    );
  }

  const exercises = await listExercises(user.id);
  const ids = [...new Set([...exercises.map((e) => e.id), ...workout.exercises.map((e) => e.exercise.id)])];
  const [last, hints] = await Promise.all([getLastPerformance(user.id, ids), getProgressionHints(user.id, ids)]);

  // key: после отмены/новой тренировки редактор монтируется с чистым состоянием.
  return <WorkoutEditor key={workout.id} workout={workout} exercises={exercises} last={last} hints={hints} />;
}

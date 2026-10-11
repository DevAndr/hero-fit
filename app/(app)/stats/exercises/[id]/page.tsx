import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExerciseProgressView } from "@/components/stats/exercise-progress-view";
import { requireUser } from "@/lib/auth/dal";
import { getExerciseProgress } from "@/lib/stats/queries";
import { getExerciseGoal } from "@/lib/goals/queries";

export const metadata: Metadata = { title: "Прогресс упражнения" };

export default async function ExerciseProgressPage({ params }: PageProps<"/stats/exercises/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [data, goal] = await Promise.all([getExerciseProgress(user.id, id), getExerciseGoal(user.id, id)]);
  if (!data) notFound();
  return <ExerciseProgressView data={data} goal={goal} back={{ href: "/stats", label: "Статистика" }} workoutHref={(w) => `/workouts/${w}`} />;
}

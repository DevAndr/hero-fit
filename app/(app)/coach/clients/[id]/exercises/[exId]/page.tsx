import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExerciseProgressView } from "@/components/stats/exercise-progress-view";
import { requireClientOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { getExerciseProgress } from "@/lib/stats/queries";

export const metadata: Metadata = { title: "Прогресс клиента" };

export default async function CoachClientExercisePage({ params }: PageProps<"/coach/clients/[id]/exercises/[exId]">) {
  const { id, exId } = await params;
  const { client } = await requireClientOf(id);
  const data = await getExerciseProgress(client.id, exId);
  if (!data) notFound();
  const base = `/coach/clients/${client.id}`;
  return (
    <ExerciseProgressView
      data={data}
      back={{ href: `${base}?tab=stats`, label: clientDisplayName(client) }}
      workoutHref={(w) => `${base}/workouts/${w}`}
    />
  );
}

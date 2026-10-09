import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { WorkoutSummaryView } from "@/components/workouts/workout-summary-view";
import { requireClientOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { getWorkoutSummary } from "@/lib/workouts/queries";

export const metadata: Metadata = { title: "Тренировка клиента" };

/** Тренировка клиента глазами тренера: та же сводка, только чтение. */
export default async function CoachClientWorkoutPage({ params }: PageProps<"/coach/clients/[id]/workouts/[wid]">) {
  const { id, wid } = await params;
  const { client } = await requireClientOf(id);
  const workout = await getWorkoutSummary(client.id, wid);
  if (!workout) notFound();
  const base = `/coach/clients/${client.id}`;

  return (
    <WorkoutSummaryView
      workout={workout}
      owner={client}
      title={workout.name}
      readOnly
      bossTaken
      exerciseHref={(exerciseId) => `${base}/exercises/${exerciseId}`}
      footer={
        <Link href={`${base}?tab=workouts`} className={buttonVariants({ variant: "outline" })}>
          {`${clientDisplayName(client)}: все тренировки`}
        </Link>
      }
    />
  );
}

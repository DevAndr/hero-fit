import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoachCommentEditor } from "@/components/coach/coach-comment";
import { CoachCommentSection } from "@/components/coach/coach-comment-note";
import { buttonVariants } from "@/components/ui/button";
import { CoachFeedbackNote } from "@/components/workouts/workout-feedback";
import { WorkoutSummaryView } from "@/components/workouts/workout-summary-view";
import { requireClientOf } from "@/lib/coach/access";
import { clientDisplayName } from "@/lib/coach/clients";
import { getWorkoutComments } from "@/lib/coach/comments-queries";
import { getWorkoutSummary } from "@/lib/workouts/queries";

export const metadata: Metadata = { title: "Тренировка клиента" };

/** Тренировка клиента глазами тренера: та же сводка, только чтение. */
export default async function CoachClientWorkoutPage({ params }: PageProps<"/coach/clients/[id]/workouts/[wid]">) {
  const { id, wid } = await params;
  const { coach, client } = await requireClientOf(id);
  const workout = await getWorkoutSummary(client.id, wid);
  if (!workout) notFound();
  // Тренер видит и правит только свои комментарии
  const comments = await getWorkoutComments(workout.id, coach.id);
  const byExercise = new Map(comments.map((c) => [c.workoutExerciseId, c]));
  const names = new Map(workout.exercises.map((we) => [we.id, we.exercise.name]));
  const editor = (workoutExerciseId: string | null) => (
    <CoachCommentEditor
      // Ключ — место, а не id: после создания/удаления редактор не пересоздаётся и переводит фокус
      key={workoutExerciseId ?? "general"}
      clientId={client.id}
      workoutId={workout.id}
      workoutExerciseId={workoutExerciseId}
      exerciseName={workoutExerciseId ? (names.get(workoutExerciseId) ?? "упражнение") : null}
      comment={byExercise.get(workoutExerciseId) ?? null}
    />
  );
  const base = `/coach/clients/${client.id}`;

  return (
    <WorkoutSummaryView
      workout={workout}
      owner={client}
      title={workout.name}
      readOnly
      bossTaken
      exerciseHref={(exerciseId) => `${base}/exercises/${exerciseId}`}
      feedback={<CoachFeedbackNote rpe={workout.rpe} note={workout.notes} />}
      renderComment={(workoutExerciseId) =>
        workoutExerciseId ? editor(workoutExerciseId) : <CoachCommentSection>{editor(null)}</CoachCommentSection>
      }
      footer={
        <Link href={`${base}?tab=workouts`} className={buttonVariants({ variant: "outline" })}>
          {`${clientDisplayName(client)}: все тренировки`}
        </Link>
      }
    />
  );
}

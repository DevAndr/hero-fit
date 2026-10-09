import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { SaveTemplateButton } from "@/components/workouts/save-template-button";
import { ShareStoryButton } from "@/components/workouts/share-story-button";
import { UpdateTemplateButton } from "@/components/workouts/update-template-button";
import { WorkoutSummaryView } from "@/components/workouts/workout-summary-view";
import { requireUser } from "@/lib/auth/dal";
import { bossRewardTaken } from "@/lib/boss/queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { differsFromTemplate } from "@/lib/templates/from-workout";
import type { FinishMeta } from "@/lib/workouts/finish";
import { getWorkoutSummary } from "@/lib/workouts/queries";

export const metadata: Metadata = { title: "Сводка тренировки" };

export default async function WorkoutSummaryPage({ params }: PageProps<"/workouts/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const workout = await getWorkoutSummary(user.id, id);
  if (!workout) notFound();

  const meta = workout.xpEvents[0]?.meta as FinishMeta | undefined;
  const ownTemplate = workout.template?.userId === user.id ? workout.template : null;
  const canUpdateTemplate = ownTemplate ? differsFromTemplate(workout.exercises, ownTemplate.exercises) : false;
  const bossTaken = meta?.boss ? await bossRewardTaken(user.id, meta.boss.week) : true;

  return (
    <WorkoutSummaryView
      workout={workout}
      owner={user}
      title={`${workout.name} — готово!`}
      readOnly={false}
      bossTaken={bossTaken}
      exerciseHref={(exerciseId) => `/stats/exercises/${exerciseId}`}
      actions={
        <>
          {canUpdateTemplate && ownTemplate ? <UpdateTemplateButton workoutId={workout.id} templateName={ownTemplate.name} /> : null}
          <SaveTemplateButton workoutId={workout.id} defaultName={workout.name} />
          {workout.finishedAt ? (
            <ShareStoryButton workoutId={workout.id} day={dayKey(workout.finishedAt, safeTimeZone(user.timeZone))} />
          ) : null}
        </>
      }
      footer={
        <Link href="/dashboard" className={buttonVariants()}>
          В кабинет
        </Link>
      }
    />
  );
}

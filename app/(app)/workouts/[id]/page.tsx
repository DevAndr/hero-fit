import type { Metadata } from "next";
import { goblinOfWorkout } from "@/lib/goblin/queries";
import { isEnabled } from "@/lib/flags/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoachCommentSection, CoachExerciseNote } from "@/components/coach/coach-comment-note";
import { buttonVariants } from "@/components/ui/button";
import { SaveTemplateButton } from "@/components/workouts/save-template-button";
import { RecordCardDialog } from "@/components/workouts/record-card-dialog";
import { ShareStoryButton } from "@/components/workouts/share-story-button";
import { UpdateTemplateButton } from "@/components/workouts/update-template-button";
import { WhoopCard } from "@/components/workouts/whoop-card";
import { WorkoutFeedback } from "@/components/workouts/workout-feedback";
import { WorkoutSummaryView } from "@/components/workouts/workout-summary-view";
import { requireUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { bossRewardTaken } from "@/lib/boss/queries";
import { commentCaption } from "@/lib/coach/comments";
import { getWorkoutComments, markCommentsRead } from "@/lib/coach/comments-queries";
import { dayKey, safeTimeZone } from "@/lib/daily-login";
import { differsFromTemplate } from "@/lib/templates/from-workout";
import { bestRecordPerExercise } from "@/lib/share/story";
import type { FinishMeta } from "@/lib/workouts/finish";
import { getWorkoutSummary } from "@/lib/workouts/queries";
import { getWhoopCard, whoopAvailable } from "@/lib/whoop/queries";
import { TogetherSummaryBlock } from "@/components/together/summary-block";
import { getTogetherSummary } from "@/lib/together/summary";

export const metadata: Metadata = { title: "Сводка тренировки" };

/** Окно «Новый рекорд!» всплывает само, если тренировка завершена не раньше 6 ч назад (а не при просмотре старой). */
const RECORD_CARD_FRESH_MS = 6 * 60 * 60 * 1000;

export default async function WorkoutSummaryPage({ params }: PageProps<"/workouts/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const workout = await getWorkoutSummary(user.id, id);
  if (!workout) notFound();

  const meta = workout.xpEvents[0]?.meta as FinishMeta | undefined;
  const ownTemplate = workout.template?.userId === user.id ? workout.template : null;
  const canUpdateTemplate = ownTemplate ? differsFromTemplate(workout.exercises, ownTemplate.exercises) : false;
  const bossTaken = meta?.boss ? await bossRewardTaken(user.id, meta.boss.week) : true;
  const goblinOpened = meta?.goblin ? Boolean((await goblinOfWorkout(user.id, workout.id))?.rewardOpenedAt) : true;
  const goalIds = meta?.goals?.achieved.map((g) => g.id) ?? [];
  const goalChests = goalIds.length
    ? (await db.goal.findMany({ where: { id: { in: goalIds }, userId: user.id, chestOpenedAt: null }, select: { id: true } })).map((g) => g.id)
    : [];
  // Комментарии тренеров (и бывших — это история клиента); открыл сводку — прочитал
  const comments = await getWorkoutComments(workout.id);
  if (comments.length) await markCommentsRead(user.id, workout.id);
  const byExercise = new Map(comments.map((c) => [c.workoutExerciseId, c]));
  // Пульс и strain из WHOOP — только владельцу (страница и так только его), при флаге и подключении
  const whoopCard = (await whoopAvailable(user.id)) ? await getWhoopCard(user.id, workout) : null;
  const together = (await isEnabled("together", user.id)) ? await getTogetherSummary(user.id, workout.id) : null;
  // Карточки рекордов — по тумблеру в /settings; сами всплывают только у только что завершённой тренировки
  const { shareRecordCards } = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { shareRecordCards: true } });
  const recordExercises = shareRecordCards && meta?.records.length ? bestRecordPerExercise(meta.records, false).map((r) => r.exerciseName) : [];
  const freshFinish = workout.finishedAt !== null && new Date().getTime() - workout.finishedAt.getTime() < RECORD_CARD_FRESH_MS;

  return (
    <WorkoutSummaryView
      workout={workout}
      owner={user}
      timeZone={safeTimeZone(user.timeZone)}
      title={`${workout.name} — готово!`}
      readOnly={false}
      bossTaken={bossTaken}
      goblinOpened={goblinOpened}
      supersets={await isEnabled("workout_formats", user.id)}
      goalChests={goalChests}
      exerciseHref={(exerciseId) => `/stats/exercises/${exerciseId}`}
      wearable={
        whoopCard || together ? (
          <div className="space-y-4">
            {together ? <TogetherSummaryBlock summary={together} /> : null}
            {whoopCard ? <WhoopCard workoutId={workout.id} initial={whoopCard} /> : null}
          </div>
        ) : null
      }
      recordCard={
        recordExercises.length && workout.finishedAt ? (
          <RecordCardDialog
            workoutId={workout.id}
            exercises={recordExercises}
            day={dayKey(workout.finishedAt, safeTimeZone(user.timeZone))}
            autoOpen={freshFinish}
          />
        ) : null
      }
      feedback={<WorkoutFeedback workoutId={workout.id} rpe={workout.rpe} note={workout.notes} />}
      renderComment={(workoutExerciseId) => {
        const comment = byExercise.get(workoutExerciseId);
        if (!comment) return null;
        if (workoutExerciseId) return <CoachExerciseNote comment={comment} />;
        return (
          <CoachCommentSection caption={commentCaption(comment.coachName, comment.updatedAt, safeTimeZone(user.timeZone))}>
            <p className="mt-2 whitespace-pre-line text-sm">{comment.text}</p>
          </CoachCommentSection>
        );
      }}
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

import type { Metadata } from "next";
import { PageHeader } from "@/components/app/app-shell";
import { MuscleRecoveryProvider } from "@/components/training/exercise-filter";
import { OfflineCleanup } from "@/components/training/offline-cleanup";
import { StartScreen } from "@/components/training/start-screen";
import { WorkoutEditor } from "@/components/training/workout-editor";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { getOccurrence, getTodayPlan } from "@/lib/plans/queries";
import { listExercises } from "@/lib/exercises/queries";
import { getBossView } from "@/lib/boss/queries";
import { getMuscleRecovery, getRecoveryPlan } from "@/lib/progress/recovery-queries";
import { getProgressionHints } from "@/lib/stats/queries";
import { getOwnTemplateTargets } from "@/lib/templates/queries";
import { getTemplateTargets } from "@/lib/coach/target-queries";
import { formatTarget, type Target } from "@/lib/coach/targets";
import { getActiveWorkout, getLastPerformance, getStartOptions } from "@/lib/workouts/queries";

export const metadata: Metadata = { title: "Тренировка" };

export default async function TrainingPage() {
  const user = await requireUser();
  const workout = await getActiveWorkout(user.id);

  if (!workout) {
    const [options, plans, recovery] = await Promise.all([
      getStartOptions(user.id),
      getTodayPlan(user.id, safeTimeZone(user.timeZone)),
      getRecoveryPlan(user.id),
    ]);
    // Невыполненный план на сегодня (или пропущенный вчера) — первым вариантом
    const plan = plans.today[0] ?? plans.missedYesterday;
    return (
      <>
        <PageHeader title="Новая тренировка" description="Начните с нуля, с шаблона или повторите прошлую" />
        <StartScreen {...options} plan={plan} recovery={{ groups: recovery.groups, exercises: recovery.exercises.length }} />
        <OfflineCleanup />
      </>
    );
  }

  const exercises = await listExercises(user.id);
  const ids = [...new Set([...exercises.map((e) => e.id), ...workout.exercises.map((e) => e.exercise.id)])];
  const [last, allHints, occurrence, recovery, boss, targets, own] = await Promise.all([
    getLastPerformance(user.id, ids),
    getProgressionHints(user.id, ids),
    workout.planKey ? getOccurrence(user.id, workout.planKey) : null,
    getMuscleRecovery(user.id),
    // Урон этой тренировки досчитывает редактор
    getBossView(user.id, safeTimeZone(user.timeZone), new Date(), workout.id),
    // Пометка «от тренера» — текущие задания активного тренера по шаблону тренировки
    workout.templateId ? getTemplateTargets(user.id, workout.templateId) : new Map<string, Target>(),
    // Своя прогрессия по шаблону тренировки — вес растёт сам, подсказка «Пора увеличить вес» лишняя
    workout.templateId ? getOwnTemplateTargets(user.id, workout.templateId) : new Map<string, Target>(),
  ]);
  const hints = Object.fromEntries(Object.entries(allHints).filter(([exerciseId]) => !own.has(exerciseId)));
  const bodyweight = new Set(workout.exercises.filter((e) => e.exercise.isBodyweight).map((e) => e.exercise.id));
  const coachTargets = Object.fromEntries(
    [...targets].flatMap(([exerciseId, t]) => {
      const label = formatTarget(t, { bodyweight: bodyweight.has(exerciseId) });
      return label ? [[exerciseId, label]] : [];
    }),
  );
  const plan = occurrence ? { key: occurrence.occurrence.key, title: occurrence.occurrence.title } : null;

  // key: после отмены/новой тренировки редактор монтируется с чистым состоянием.
  return (
    <MuscleRecoveryProvider recovery={recovery}>
      <WorkoutEditor
        key={workout.id}
        workout={workout}
        exercises={exercises}
        last={last}
        hints={hints}
        coachTargets={coachTargets}
        plan={plan}
        boss={boss}
        targets={Object.fromEntries(targets)}
        own={Object.fromEntries(own)}
      />
    </MuscleRecoveryProvider>
  );
}

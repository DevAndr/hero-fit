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
import { getWhoopRecovery } from "@/lib/whoop/queries";
import { db } from "@/lib/db";
import { isEnabled } from "@/lib/flags/server";
import { openSessionOf, partnerName } from "@/lib/together/queries";
import { inviteExpiresAt } from "@/lib/together/rules";
import type { TogetherInitial } from "@/components/together/together-control";
import type { CourseInfo } from "@/components/training/course-banner";
import { isCourseSkill, isMeasureSession, stageOf, COURSE_SESSIONS } from "@/lib/stretching/course";
import { courseAllowed } from "@/lib/stretching/course-access";
import { STRETCH_SKILLS } from "@/lib/stretching/skills";

export const metadata: Metadata = { title: "Тренировка" };

export default async function TrainingPage() {
  const user = await requireUser();
  const workout = await getActiveWorkout(user.id);
  const timeZone = safeTimeZone(user.timeZone);
  // Восстановление мышц — и для своей карты, и для советов WHOOP (строка зоны)
  const recoveryAndWhoop = () => {
    const muscles = getMuscleRecovery(user.id);
    return { muscles, whoop: muscles.then((m) => getWhoopRecovery(user.id, timeZone, m)) };
  };

  if (!workout) {
    const { muscles, whoop: whoopOf } = recoveryAndWhoop();
    const [options, plans, recovery, whoop, together] = await Promise.all([
      getStartOptions(user.id),
      getTodayPlan(user.id, timeZone),
      getRecoveryPlan(user.id, undefined, muscles),
      whoopOf,
      isEnabled("together", user.id).then((on) => (on ? togetherInitial(user.id) : null)),
    ]);
    // Невыполненный план на сегодня (или пропущенный вчера) — первым вариантом
    const plan = plans.today[0] ?? plans.missedYesterday;
    return (
      <>
        <PageHeader title="Новая тренировка" description="Начните с нуля, с шаблона или повторите прошлую" />
        <StartScreen
          {...options}
          plan={plan}
          recovery={{ groups: recovery.groups, exercises: recovery.exercises.length }}
          whoop={whoop}
          together={together?.status === "ACTIVE" && together.role === "guest" ? together.partnerName : null}
        />
        <OfflineCleanup />
      </>
    );
  }

  const exercises = await listExercises(user.id);
  const ids = [...new Set([...exercises.map((e) => e.id), ...workout.exercises.map((e) => e.exercise.id)])];
  const { muscles, whoop: whoopOf } = recoveryAndWhoop();
  const occurrenceOf = workout.planKey ? getOccurrence(user.id, workout.planKey) : Promise.resolve(null);
  const [last, allHints, occurrence, recovery, whoop, boss, targets, own, course] = await Promise.all([
    getLastPerformance(user.id, ids),
    getProgressionHints(user.id, ids),
    occurrenceOf,
    muscles,
    whoopOf,
    // Урон этой тренировки досчитывает редактор
    getBossView(user.id, timeZone, new Date(), workout.id),
    // Пометка «от тренера» / «программа «…»» — задания и неделя программы по шаблону (неделя — по дате вхождения плана, как при старте)
    workout.templateId
      ? occurrenceOf.then((o) => getTemplateTargets(user.id, workout.templateId!, o?.occurrence.date))
      : new Map<string, Target & { program?: string }>(),
    // Своя прогрессия по шаблону тренировки — вес растёт сам, подсказка «Пора увеличить вес» лишняя
    workout.templateId ? getOwnTemplateTargets(user.id, workout.templateId) : new Map<string, Target>(),
    courseInfo(user.id, workout.courseId ?? null, workout.courseSessionNo ?? null),
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
  const together = (await isEnabled("together", user.id)) ? { initial: await togetherInitial(user.id) } : null;

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
        whoop={whoop}
        together={together}
        course={course}
      />
    </MuscleRecoveryProvider>
  );
}

/** Строка курса и плашка замера; без флагов курса — обычная сессия растяжки. */
async function courseInfo(userId: string, courseId: string | null, session: number | null): Promise<CourseInfo | null> {
  if (!courseId || !session || !(await courseAllowed(userId))) return null;
  const course = await db.stretchCourse.findFirst({
    where: { id: courseId, userId, status: { in: ["ACTIVE", "MAINTENANCE"] } },
    select: { skill: true, goal: { select: { id: true, status: true } } },
  });
  if (!course || !isCourseSkill(course.skill)) return null;
  // Цель удалили или она уже закрыта — замерять некуда, курс идёт дальше
  const goal = course.goal?.status === "ACTIVE" ? course.goal : null;
  return {
    session,
    stage: stageOf(session),
    maintenance: session > COURSE_SESSIONS,
    measure: goal && isMeasureSession(session) ? { goalId: goal.id, measureLabel: STRETCH_SKILLS[course.skill].measure } : null,
  };
}

/** Открытая совместная сессия — для полосы партнёра сразу после загрузки. */
async function togetherInitial(userId: string): Promise<TogetherInitial> {
  const s = await openSessionOf(db, userId, new Date());
  if (!s) return null;
  const partner = await db.user.findUniqueOrThrow({ where: { id: s.hostId === userId ? s.guestId : s.hostId }, select: { nickname: true } });
  return {
    id: s.id,
    status: s.status === "ACTIVE" ? "ACTIVE" : "INVITED",
    role: s.hostId === userId ? "host" : "guest",
    partnerName: partnerName(partner.nickname),
    expiresAt: s.status === "INVITED" ? inviteExpiresAt(s.createdAt).toISOString() : null,
  };
}

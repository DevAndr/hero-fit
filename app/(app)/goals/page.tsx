import type { Metadata } from "next";
import { Target } from "lucide-react";
import { PageHeader } from "@/components/app/app-shell";
import { BodyWeightBlock } from "@/components/goals/body-weight-block";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalHistory } from "@/components/goals/goal-history";
import { NewGoal } from "@/components/goals/new-goal-dialog";
import { requireUser } from "@/lib/auth/dal";
import { safeTimeZone } from "@/lib/daily-login";
import { db } from "@/lib/db";
import { getGoalFormData, getGoalsPage } from "@/lib/goals/queries";
import { GOALS_ACTIVE_MAX, isInputGoalType, isStrengthMetric, isStretchGoal, type GoalInput } from "@/lib/goals/rules";
import { goalStretchWeeks } from "@/lib/goals/stretch-weekly";

export const metadata: Metadata = { title: "Цели" };

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const user = await requireUser();
  const tz = safeTimeZone(user.timeZone);
  const { again: againId } = await searchParams;
  const [page, form, againGoal] = await Promise.all([
    getGoalsPage(user.id, tz),
    getGoalFormData(user.id, tz),
    againId
      ? db.goal.findFirst({ where: { id: againId, userId: user.id, status: "FAILED" }, select: { type: true, exerciseId: true, metric: true, target: true, stretchUnit: true, stretchSkill: true, skillTitle: true, startValue: true, createdAt: true, deadline: true } })
      : null,
  ]);
  const activeCount = page.active.filter((g) => g.status === "ACTIVE").length;
  // «Поставить снова»: при 5 активных — не открываем (сохранить нельзя); упражнение в архиве — без него, выберешь заново
  const againExercise = againGoal?.exerciseId && [...form.exercises, ...form.stretchExercises].some((e) => e.id === againGoal.exerciseId) ? againGoal.exerciseId : undefined;
  const again: Partial<GoalInput> | null =
    // растяжка без флага — без «Поставить снова»
    againGoal && isInputGoalType(againGoal.type) && (form.stretch || !isStretchGoal(againGoal.type)) && activeCount < GOALS_ACTIVE_MAX
      ? {
          type: againGoal.type,
          target: againGoal.target,
          exerciseId: againExercise,
          metric: isStrengthMetric(againGoal.metric) ? againGoal.metric : undefined,
          // регулярность — та же норма и то же число недель
          ...(againGoal.type === "STRETCH_WEEKLY"
            ? { stretchUnit: againGoal.stretchUnit ?? undefined, weeks: goalStretchWeeks(againGoal, tz).length || undefined }
            : {}),
          // навык — тот же навык, замер — стартовый прежней цели (хозяин обновит на актуальный)
          ...(againGoal.type === "STRETCH_SKILL"
            ? { stretchSkill: againGoal.stretchSkill ?? undefined, skillTitle: againGoal.skillTitle ?? undefined, startCm: againGoal.startValue || undefined }
            : {}),
        }
      : null;
  const weightGoal = page.active.find((g) => g.type === "BODY_WEIGHT" && g.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <PageHeader title="Цели" description="Поставь цель — сила, регулярность или вес тела — и забери сундук, когда дойдёшь" />

      <NewGoal key={againId ?? "new"} form={form} activeCount={activeCount} suggestions={page.suggestions} again={again} />

      {page.active.length ? (
        <section aria-label="Активные цели" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {page.active.map((g) => (
            <GoalCard key={g.id} goal={g} today={form.today} />
          ))}
        </section>
      ) : page.history.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <Target className="mt-0.5 size-5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">Целей пока нет.</span> Цель — это конкретное число и, по желанию, срок: «жим 100 кг»,
            «50 тренировок до конца года». Прогресс считается сам из твоих тренировок.
          </p>
        </div>
      ) : null}

      <BodyWeightBlock weights={page.weights} target={weightGoal?.target ?? null} />

      <GoalHistory goals={page.history} timeZone={tz} />
    </div>
  );
}

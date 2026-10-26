import { Activity, CalendarDays, History, Play, Plus, Users } from "lucide-react";
import { SkipPlanButton } from "@/components/calendar/skip-plan-button";
import { RecoveryLine } from "@/components/training/recovery-line";
import { Button } from "@/components/ui/button";
import type { MuscleGroup } from "@/generated/prisma/enums";
import { plural } from "@/lib/format";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";
import { createWorkoutAction } from "@/lib/workouts/actions";
import type { StartOptions } from "@/lib/workouts/queries";
import type { WhoopRecoveryView } from "@/lib/whoop/queries";

function StartForm({
  source,
  children,
  wrapperClassName,
  ...button
}: { source: string; wrapperClassName?: string } & React.ComponentProps<typeof Button>) {
  return (
    <form action={createWorkoutAction} className={wrapperClassName}>
      <input type="hidden" name="source" value={source} />
      <Button type="submit" {...button}>
        {children}
      </Button>
    </form>
  );
}

const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

export function StartScreen({
  templates,
  coachTemplates,
  lastWorkout,
  plan,
  recovery,
  whoop,
  together,
}: StartOptions & {
  plan?: { key: string; title: string; time: string } | null;
  /** Что соберёт «По восстановлению» (`getRecoveryPlan`). */
  recovery: { groups: MuscleGroup[]; exercises: number };
  /** Восстановление WHOOP — строка зоны (без «Облегчить»: облегчать пока нечего). */
  whoop?: WhoopRecoveryView | null;
  /** Принял приглашение без тренировки: имя партнёра — первая начатая тренировка станет совместной. */
  together?: string | null;
}) {
  const mine = templates.filter((t) => t.userId);
  const programs = Map.groupBy(
    templates.filter((t) => !t.userId),
    (t) => t.program ?? "Программы",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <RecoveryLine view={whoop} />
      {together ? (
        <p role="region" aria-label="Совместная тренировка" className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          <Users className="size-4 shrink-0 text-primary" aria-hidden />
          Тренировка с {together}: начните любую — она станет совместной
        </p>
      ) : null}
      {plan ? (
        <div className="space-y-1">
          <StartForm source={`plan:${plan.key}`} size="lg" className="h-auto w-full flex-col gap-1 py-4">
            <span className="flex items-center gap-2 text-base">
              <CalendarDays />
              По плану: {plan.title} · {plan.time}
            </span>
            <span className="text-xs font-normal opacity-80">Запланировано в календаре на сегодня</span>
          </StartForm>
          <div className="flex justify-end">
            <SkipPlanButton planKey={plan.key} title={plan.title} className="text-muted-foreground" />
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <StartForm source="empty" size="lg" className="h-auto w-full flex-col gap-1 py-4">
          <span className="flex items-center gap-2 text-base">
            <Plus />
            Пустая тренировка
          </span>
          <span className="text-xs font-normal opacity-80">Соберите упражнения сами</span>
        </StartForm>
        {lastWorkout ? (
          <StartForm
            source={`repeat:${lastWorkout.id}`}
            size="lg"
            variant="outline"
            className="h-auto w-full flex-col gap-1 py-4"
          >
            <span className="flex items-center gap-2 text-base text-wrap">
              <History />
              Повторить «{lastWorkout.name}»
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {lastWorkout.finishedAt ? dateFormat.format(lastWorkout.finishedAt) : ""} · упражнений:{" "}
              {lastWorkout._count.exercises}
            </span>
          </StartForm>
        ) : null}
        <StartForm
          source="recovery"
          size="lg"
          variant="outline"
          disabled={!recovery.exercises}
          className="h-auto w-full flex-col gap-1 py-4"
          wrapperClassName={cn(lastWorkout && "sm:col-span-2")}
        >
          <span className="flex items-center gap-2 text-base">
            <Activity />
            Собрать по восстановлению
          </span>
          <span className="text-xs font-normal text-muted-foreground" data-testid="recovery-plan-preview">
            {recovery.exercises
              ? `${recovery.groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")} — ${recovery.exercises} ${plural(recovery.exercises, "упражнение", "упражнения", "упражнений")}`
              : "Все группы мышц ещё восстанавливаются"}
          </span>
        </StartForm>
      </div>

      {coachTemplates.length ? <TemplateSection title="От тренера" items={coachTemplates} /> : null}
      {mine.length ? <TemplateSection title="Мои шаблоны" items={mine} /> : null}
      {[...programs].map(([program, items]) => (
        <TemplateSection key={program} title={program} items={items} />
      ))}
    </div>
  );
}

function TemplateSection({ title, items }: { title: string; items: StartOptions["templates"] }) {
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((t) => (
          <div key={t.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <div className="flex-1">
              <h3 className="font-semibold">{t.name}</h3>
              {t.description ? <p className="text-sm text-muted-foreground">{t.description}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {t.exercises.map((e) => `${e.exercise.name} ×${e.targetSets}`).join(" · ")}
              </p>
            </div>
            <StartForm source={`template:${t.id}`} variant="secondary" className="w-full" aria-label={`Начать «${t.name}»`}>
              <Play />
              Начать
            </StartForm>
          </div>
        ))}
      </div>
    </section>
  );
}

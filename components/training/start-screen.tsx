import { CalendarDays, History, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWorkoutAction } from "@/lib/workouts/actions";
import type { StartOptions } from "@/lib/workouts/queries";

function StartForm({ source, children, ...button }: { source: string } & React.ComponentProps<typeof Button>) {
  return (
    <form action={createWorkoutAction}>
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
  lastWorkout,
  plan,
}: StartOptions & { plan?: { key: string; title: string; time: string } | null }) {
  const mine = templates.filter((t) => t.userId);
  const programs = Map.groupBy(
    templates.filter((t) => !t.userId),
    (t) => t.program ?? "Программы",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {plan ? (
        <StartForm source={`plan:${plan.key}`} size="lg" className="h-auto w-full flex-col gap-1 py-4">
          <span className="flex items-center gap-2 text-base">
            <CalendarDays />
            По плану: {plan.title} · {plan.time}
          </span>
          <span className="text-xs font-normal opacity-80">Запланировано в календаре на сегодня</span>
        </StartForm>
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
            <span className="flex items-center gap-2 text-base">
              <History />
              Повторить «{lastWorkout.name}»
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {lastWorkout.finishedAt ? dateFormat.format(lastWorkout.finishedAt) : ""} · упражнений:{" "}
              {lastWorkout._count.exercises}
            </span>
          </StartForm>
        ) : null}
      </div>

      {mine.length ? <TemplateSection title="Мои шаблоны" items={mine} /> : null}
      {[...programs].map(([program, items]) => (
        <TemplateSection key={program} title={program} items={items} />
      ))}
    </div>
  );
}

function TemplateSection({ title, items }: { title: string; items: StartOptions["templates"] }) {
  return (
    <section className="space-y-3">
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

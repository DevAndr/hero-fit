"use client";

import { Fragment, useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { CircleAlert, CloudCheck, EllipsisVertical, Flag, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ExerciseBlock } from "@/components/training/exercise-block";
import { ExerciseCatalog } from "@/components/training/exercise-catalog";
import { ExercisePicker } from "@/components/training/exercise-picker";
import {
  NotificationToggle,
  RestTimerBar,
  RestTimerProvider,
  RestTimerSpacer,
  useRestTimer,
} from "@/components/training/rest-timer";
import { formatClock } from "@/lib/format";
import { useAutosave, type SaveStatus } from "@/components/training/use-autosave";
import { DropIndicator, ExerciseDropList, SortableItem, WorkoutDnd } from "@/components/training/workout-dnd";
import { initState, reducer, toDraft, type ExerciseState, type SetState } from "@/components/training/workout-state";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { cancelWorkoutAction, finishWorkoutAction, startWorkoutAction } from "@/lib/workouts/actions";
import type { ProgressionHint } from "@/lib/progress/progression";
import type { ActiveWorkout, LastPerformance } from "@/lib/workouts/queries";
import { workoutTotals } from "@/lib/workouts/schema";

type Props = {
  workout: ActiveWorkout;
  exercises: ExerciseItem[];
  last: LastPerformance;
  hints: Record<string, ProgressionHint>;
};

export function WorkoutEditor(props: Props) {
  return (
    <RestTimerProvider>
      <Editor {...props} />
      <RestTimerSpacer />
      <RestTimerBar />
    </RestTimerProvider>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return (
    <span className="font-mono text-2xl font-black tabular-nums" data-testid="elapsed">
      {formatClock(sec)}
    </span>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "error")
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <CircleAlert className="size-3.5" />
        Не сохранено — проверьте сеть
      </span>
    );
  if (status === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="save-status">
        <CloudCheck className="size-3.5" />
        Сохранено
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="save-status">
      <Loader2 className="size-3.5 animate-spin" />
      Сохранение…
    </span>
  );
}

/** Подпись для таймера отдыха: какой подход следующий. */
function nextLabel(exercises: ExerciseState[], current: ExerciseState, justDone: SetState) {
  const remainingHere = current.sets.filter((s) => s.key !== justDone.key && !s.completedAt);
  if (remainingHere.length) return current.exercise.name;
  const index = exercises.findIndex((e) => e.key === current.key);
  const next = exercises.slice(index + 1).find((e) => e.sets.some((s) => !s.completedAt));
  return next?.exercise.name ?? null;
}

function Editor({ workout, exercises, last, hints }: Props) {
  const [state, dispatch] = useReducer(reducer, workout, initState);
  const draft = useMemo(() => toDraft(state), [state]);
  const { status, settle } = useAutosave(workout.id, draft);
  const rest = useRestTimer();
  const [pending, startTransition] = useTransition();
  const [finishOpen, setFinishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const totals = workoutTotals(draft.exercises);
  const pendingSets = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completedAt).length, 0);
  const added = useMemo(() => new Set(state.exercises.map((e) => e.exercise.id)), [state.exercises]);

  const addExercises = (items: ExerciseItem[], index?: number) =>
    dispatch({
      type: "addExercises",
      exercises: items.map((e) => ({
        exercise: {
          id: e.id,
          name: e.name,
          muscleGroups: e.muscleGroups,
          isBodyweight: e.isBodyweight,
        },
        restSec: e.defaultRestSec,
      })),
      last,
      index,
    });

  const start = async () => {
    await settle();
    const result = await startWorkoutAction(workout.id);
    if (result.ok && result.startedAt) dispatch({ type: "started", startedAt: result.startedAt });
    else if (!result.ok) toast.error(result.error);
    return result.ok;
  };

  const onComplete = (item: ExerciseState, set: SetState) => {
    if (state.status === "PLANNED") void start();
    const label = nextLabel(state.exercises, item, set);
    if (label) rest.start(item.restSec, label);
  };

  const finish = () =>
    startTransition(async () => {
      await settle();
      rest.skip();
      const result = await finishWorkoutAction(workout.id, toDraft(state));
      // При успехе action делает redirect на сводку; сюда попадаем только с ошибкой.
      if (result && !result.ok) {
        toast.error(result.error);
        setFinishOpen(false);
      }
    });

  const cancel = () =>
    startTransition(async () => {
      await settle();
      rest.skip();
      await cancelWorkoutAction(workout.id);
    });

  return (
    <WorkoutDnd
      exercises={state.exercises}
      onReorder={(key, toIndex) => dispatch({ type: "reorderExercise", key, toIndex })}
      onDropFromCatalog={(exercise, index) => addExercises([exercise], index)}
    >
      {(dropIndex) => (
        // На ПК справа — каталог упражнений; на мобильных — диалог «Добавить упражнение»
        <div className="mx-auto max-w-2xl lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <Input
                  value={state.name}
                  onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
                  aria-label="Название тренировки"
                  className="h-auto border-none bg-transparent px-0 text-xl font-black shadow-none focus-visible:ring-0 dark:bg-transparent"
                  maxLength={80}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label="Действия с тренировкой" />}
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem variant="destructive" onClick={() => setCancelOpen(true)}>
                      <Trash2 />
                      Отменить тренировку
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                {state.status === "IN_PROGRESS" && state.startedAt ? (
                  <Elapsed since={state.startedAt} />
                ) : (
                  <span className="text-sm text-muted-foreground">Соберите тренировку и нажмите «Начать»</span>
                )}
                <SaveIndicator status={status} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
                <span>
                  Подходы: <b className="text-foreground">{totals.sets}</b>
                </span>
                <span>
                  Повторы: <b className="text-foreground">{totals.reps}</b>
                </span>
                <span>
                  Объём: <b className="text-foreground">{totals.volume.toLocaleString("ru-RU")} кг</b>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {state.status === "PLANNED" ? (
                  <Button
                    size="lg"
                    disabled={state.exercises.length === 0 || pending}
                    onClick={() => startTransition(async () => void (await start()))}
                  >
                    <Play />
                    Начать
                  </Button>
                ) : null}
                <NotificationToggle />
              </div>
            </div>

            <ExerciseDropList empty={state.exercises.length === 0}>
              {state.exercises.map((item, index) => (
                <Fragment key={item.key}>
                  {dropIndex === index ? <DropIndicator /> : null}
                  <SortableItem id={item.key} label={item.exercise.name}>
                    {(handle) => (
                      <ExerciseBlock
                        item={item}
                        index={index}
                        total={state.exercises.length}
                        last={last[item.exercise.id]}
                        hint={hints[item.exercise.id]}
                        dispatch={dispatch}
                        onComplete={onComplete}
                        handle={handle}
                      />
                    )}
                  </SortableItem>
                </Fragment>
              ))}
              {dropIndex !== null && dropIndex === state.exercises.length && state.exercises.length > 0 ? (
                <DropIndicator />
              ) : null}
            </ExerciseDropList>

            <ExercisePicker
              exercises={exercises}
              alreadyAdded={added}
              onAdd={(items) => addExercises(items)}
              className="lg:hidden"
            />

            {state.status === "IN_PROGRESS" ? (
              <Button size="lg" className="w-full" onClick={() => setFinishOpen(true)} disabled={pending}>
                <Flag />
                Завершить тренировку
              </Button>
            ) : null}

            <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Завершить тренировку?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Выполнено подходов: {totals.sets}, объём {totals.volume.toLocaleString("ru-RU")} кг.
                    {pendingSets > 0 ? ` Неотмеченные подходы (${pendingSets}) не попадут в историю.` : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Продолжить</AlertDialogCancel>
                  <AlertDialogAction onClick={finish} disabled={pending}>
                    {pending ? <Loader2 className="animate-spin" /> : null}
                    Завершить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Отменить тренировку?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Все введённые подходы будут удалены, XP не начислится.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Назад</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={cancel} disabled={pending}>
                    Отменить тренировку
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <ExerciseCatalog exercises={exercises} alreadyAdded={added} onAdd={(e) => addExercises([e])} />
        </div>
      )}
    </WorkoutDnd>
  );
}

"use client";

import { ArrowDown, ArrowUp, Check, EllipsisVertical, Minus, Plus, Timer, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useState, type Dispatch, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { HintBadge } from "@/components/stats/hint-badge";
import { LottiePlayer, preloadLottie, prefersReducedMotion } from "@/components/lottie/lottie-player";
import { PlateTools } from "@/components/training/plate-tools";
import type { ProgressionHint } from "@/lib/progress/progression";
import type { LastPerformance } from "@/lib/workouts/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";
import type { Action, ExerciseState, SetState } from "@/components/training/workout-state";

const formatSets = (sets: { weight: number; reps: number }[]) =>
  sets.map((s) => (s.weight ? `${s.weight}×${s.reps}` : `${s.reps}`)).join(", ");

export function ExerciseBlock({
  item,
  index,
  total,
  last,
  hint,
  coachTarget,
  dispatch,
  onComplete,
  handle,
}: {
  item: ExerciseState;
  index: number;
  total: number;
  last?: LastPerformance[string];
  hint?: ProgressionHint;
  /** «от тренера: 4 × 8 · 60 кг» — задание активного тренера по этому упражнению шаблона. */
  coachTarget?: string;
  dispatch: Dispatch<Action>;
  /** Вызывается, когда подход отмечен выполненным (запуск таймера отдыха). */
  onComplete: (item: ExerciseState, set: SetState) => void;
  /** Ручка перетаскивания (на ПК). */
  handle?: ReactNode;
}) {
  const { exercise } = item;
  const doneCount = item.sets.filter((s) => s.completedAt).length;
  // Подходы, у которых сейчас играет анимация «готово» вместо кнопки
  const [celebrating, setCelebrating] = useState<ReadonlySet<string>>(new Set());
  const stopCelebrating = (setKey: string) =>
    setCelebrating((prev) => {
      const next = new Set(prev);
      next.delete(setKey);
      return next;
    });
  useEffect(() => preloadLottie("success"), []);

  return (
    <section className="rounded-xl border bg-card" aria-label={exercise.name}>
      <header className="flex items-start gap-2 p-4 pb-2">
        {handle}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{exercise.name}</h3>
          <p className="text-xs text-muted-foreground">
            {exercise.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")} · {doneCount}/{item.sets.length}
          </p>
          {last?.sets.length ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Прошлый раз: <span className="text-foreground">{formatSets(last.sets)}</span>
            </p>
          ) : null}
          {coachTarget ? <p className="mt-1 text-sm font-medium text-primary">{coachTarget}</p> : null}
          {hint ? <HintBadge hint={hint} className="mt-1.5 w-fit" /> : null}
        </div>

        <div className="flex items-center gap-0.5 rounded-lg border px-1 text-xs" aria-label="Отдых между подходами">
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => dispatch({ type: "setRest", key: item.key, restSec: item.restSec - 15 })}
            aria-label="Уменьшить отдых"
          >
            <Minus className="size-3" />
          </button>
          <span className="flex items-center gap-1 tabular-nums">
            <Timer className="size-3" />
            {item.restSec}с
          </span>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => dispatch({ type: "setRest", key: item.key, restSec: item.restSec + 15 })}
            aria-label="Увеличить отдых"
          >
            <Plus className="size-3" />
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Действия с упражнением" />}>
            <EllipsisVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled={index === 0} onClick={() => dispatch({ type: "moveExercise", key: item.key, delta: -1 })}>
              <ArrowUp />
              Выше
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={index === total - 1}
              onClick={() => dispatch({ type: "moveExercise", key: item.key, delta: 1 })}
            >
              <ArrowDown />
              Ниже
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => dispatch({ type: "removeExercise", key: item.key })}>
              <Trash2 />
              Убрать из тренировки
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="px-2 pb-2">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_2.75rem_2rem] items-center gap-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span>#</span>
          <span>{exercise.isBodyweight ? "доп. кг" : "кг"}</span>
          <span>повт.</span>
          <span className="sr-only">Выполнен</span>
          <span className="sr-only">Удалить</span>
        </div>

        {item.sets.map((set, i) => {
          const done = Boolean(set.completedAt);
          const workingNumber = item.sets.slice(0, i + 1).filter((s) => !s.isWarmup).length;
          return (
            <Fragment key={set.key}>
              <div
                data-testid="set-row"
                data-done={done || undefined}
                className={cn(
                  "grid grid-cols-[2.5rem_1fr_1fr_2.75rem_2rem] items-center gap-2 rounded-lg px-2 py-1 transition-colors",
                  done && "bg-primary/10",
                )}
              >
                <button
                  type="button"
                  title="Нажмите, чтобы отметить как разминочный"
                  aria-label={`Подход ${i + 1}: ${set.isWarmup ? "разминка" : "рабочий"}`}
                  onClick={() => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { isWarmup: !set.isWarmup } })}
                  className={cn(
                    "h-8 rounded-md text-sm font-bold tabular-nums",
                    set.isWarmup ? "text-xp" : "text-muted-foreground",
                  )}
                >
                  {set.isWarmup ? "Р" : workingNumber}
                </button>
                <Input
                  inputMode="decimal"
                  value={set.weight}
                  placeholder="0"
                  aria-label={`Вес, подход ${i + 1}`}
                  onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { weight: e.target.value } })}
                  className="h-9 text-center tabular-nums"
                />
                <Input
                  inputMode="numeric"
                  value={set.reps}
                  placeholder="0"
                  aria-label={`Повторы, подход ${i + 1}`}
                  onChange={(e) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { reps: e.target.value } })}
                  className="h-9 text-center tabular-nums"
                />
                <Button
                  type="button"
                  size="icon"
                  variant={done ? "default" : "outline"}
                  aria-pressed={done}
                  aria-label={`Подход ${i + 1} выполнен`}
                  onClick={() => {
                    dispatch({ type: "toggleComplete", key: item.key, setKey: set.key, now: new Date().toISOString() });
                    if (done) stopCelebrating(set.key);
                    else {
                      onComplete(item, set);
                      if (!prefersReducedMotion()) setCelebrating((prev) => new Set(prev).add(set.key));
                    }
                  }}
                  className={cn(
                    "relative size-9",
                    done && celebrating.has(set.key) && "border-transparent bg-transparent hover:bg-transparent",
                  )}
                >
                  {done && celebrating.has(set.key) ? (
                    <LottiePlayer
                      name="success"
                      speed={1.4}
                      onComplete={() => stopCelebrating(set.key)}
                      fallback={<Check className="text-primary" />}
                      className="pointer-events-none absolute -inset-3"
                    />
                  ) : (
                    <Check />
                  )}
                </Button>
                <button
                  type="button"
                  aria-label={`Удалить подход ${i + 1}`}
                  onClick={() => dispatch({ type: "removeSet", key: item.key, setKey: set.key })}
                  className="flex h-8 items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
              {done && !set.isWarmup ? (
                <RirPicker
                  value={set.rir}
                  label={`Запас повторов, подход ${i + 1}`}
                  onChange={(rir) => dispatch({ type: "updateSet", key: item.key, setKey: set.key, patch: { rir } })}
                />
              ) : null}
            </Fragment>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full text-muted-foreground"
          onClick={() => dispatch({ type: "addSet", key: item.key })}
        >
          <Plus />
          Подход
        </Button>
        {exercise.isBodyweight ? null : <PlateTools item={item} dispatch={dispatch} />}
      </div>
    </section>
  );
}

const RIR_OPTIONS = [
  { value: 0, label: "0", hint: "до отказа" },
  { value: 1, label: "1", hint: "ещё 1 повтор" },
  { value: 2, label: "2", hint: "ещё 2 повтора" },
  { value: 3, label: "3", hint: "ещё 3 повтора" },
  { value: 4, label: "4+", hint: "легко, 4 и больше" },
];

/** Сколько повторов осталось в запасе (RIR) — по нему подсказка «Пора увеличить вес» срабатывает точнее. */
function RirPicker({ value, label, onChange }: { value: number | null; label: string; onChange: (rir: number | null) => void }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1 px-2 pb-1 pl-[3.25rem] text-xs">
      <span className="mr-1 text-muted-foreground">Запас повторов</span>
      {RIR_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.hint}
          aria-label={`Запас: ${o.hint}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
          className={cn(
            "h-6 min-w-7 rounded-md border px-1.5 font-semibold tabular-nums transition-colors",
            value === o.value ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

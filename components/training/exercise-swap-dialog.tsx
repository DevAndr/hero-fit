"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExerciseFilterControls, useExerciseFilter } from "@/components/training/exercise-filter";
import type { ExerciseState } from "@/components/training/workout-state";
import { lastResultText, replacementCandidates, type PainSpot } from "@/lib/assistant/rules";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import type { LastPerformance } from "@/lib/workouts/queries";

export type SwapSource = {
  exercises: ExerciseItem[];
  last: LastPerformance;
  /** id упражнений, уже стоящих в тренировке. */
  inWorkout: string[];
  /** Болевые зоны чек-ина помощника — читаются при открытии (помощник мог записать их посреди тренировки). */
  getPain: () => PainSpot[];
};

/** Сегодня по часам устройства, YYYY-MM-DD («свежие» кандидаты — делавшиеся за 90 дней). */
const localToday = () => new Date().toLocaleDateString("sv-SE");

/**
 * «Тренажёр занят»: до 3 похожих (та же основная группа и вид — `replacementCandidates`) или любое из каталога.
 * Замена — только на эту тренировку; выбор сразу заменяет.
 */
export function ExerciseSwapDialog({
  open,
  onOpenChange,
  item,
  source,
  onReplace,
  onSkip,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ExerciseState;
  source: SwapSource;
  onReplace: (target: ExerciseItem) => void;
  onSkip: () => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  const started = item.sets.some((s) => s.completedAt);
  const change = (next: boolean) => {
    if (!next) setBrowsing(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Заменить: {item.exercise.name}</DialogTitle>
          <DialogDescription>Тренажёр занят? Похожие упражнения</DialogDescription>
        </DialogHeader>
        {started ? <p className="text-sm text-muted-foreground">Сделанные подходы останутся, новое упражнение встанет следом</p> : null}
        {open ? (
          browsing ? (
            <Catalog item={item} source={source} onPick={onReplace} />
          ) : (
            <Similar item={item} source={source} onPick={onReplace} onSkip={onSkip} onBrowse={() => setBrowsing(true)} />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Similar({
  item,
  source,
  onPick,
  onSkip,
  onBrowse,
}: {
  item: ExerciseState;
  source: SwapSource;
  onPick: (target: ExerciseItem) => void;
  onSkip: () => void;
  onBrowse: () => void;
}) {
  // Считаются один раз при открытии: список не прыгает, пока человек выбирает
  const [candidates] = useState(() => {
    const lastDate = Object.fromEntries(Object.entries(source.last).map(([id, l]) => [id, l.date.slice(0, 10)]));
    return replacementCandidates(item.exercise, source.exercises, { inWorkout: source.inWorkout, pain: source.getPain(), lastDate, today: localToday() });
  });
  return (
    <>
      {candidates.length ? (
        <ul className="grid gap-2" aria-label="Похожие упражнения">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{lastResultText(c, source.last[c.id])}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">Похожих упражнений нет</p>
      )}
      <DialogFooter>
        {candidates.length ? null : (
          <Button variant="outline" onClick={onSkip}>
            Пропустить сегодня
          </Button>
        )}
        <Button variant={candidates.length ? "outline" : "default"} onClick={onBrowse}>
          Другое упражнение…
        </Button>
      </DialogFooter>
    </>
  );
}

function Catalog({ item, source, onPick }: { item: ExerciseState; source: SwapSource; onPick: (target: ExerciseItem) => void }) {
  const choices = useMemo(() => source.exercises.filter((e) => !source.inWorkout.includes(e.id)), [source]);
  const filter = useExerciseFilter(choices, item.exercise.muscleGroups[0] ?? null);
  return (
    <>
      <ExerciseFilterControls filter={filter} className="-mx-4 px-4" />
      <ul className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4" aria-label="Список упражнений">
        {filter.filtered.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{e.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")}</span>
              </span>
            </button>
          </li>
        ))}
        {filter.filtered.length === 0 ? <li className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</li> : null}
      </ul>
    </>
  );
}

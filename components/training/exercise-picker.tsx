"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExerciseFilterControls, useExerciseFilter } from "@/components/training/exercise-filter";
import type { ExerciseItem } from "@/lib/exercises/queries";
import { MUSCLE_GROUP_LABELS } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

export function ExercisePicker({
  exercises,
  alreadyAdded,
  onAdd,
  className,
}: {
  exercises: ExerciseItem[];
  alreadyAdded: Set<string>;
  onAdd: (items: ExerciseItem[]) => void;
  /** Для кнопки-триггера (на ПК её заменяет каталог). */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const filter = useExerciseFilter(exercises);
  const { filtered } = filter;
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelected([]);
      filter.reset();
    }
  };

  const confirm = () => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    onAdd(selected.map((id) => byId.get(id)!).filter(Boolean));
    reset(false);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          <Button variant="outline" size="lg" className={cn("w-full border-dashed", className)}>
            <Plus />
            Добавить упражнение
          </Button>
        }
      />
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Добавить упражнения</DialogTitle>
          <DialogDescription>Выберите одно или несколько — порядок выбора сохранится.</DialogDescription>
        </DialogHeader>

        <ExerciseFilterControls filter={filter} className="-mx-4 px-4" />

        <ul className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4" aria-label="Список упражнений">
          {filtered.map((e) => {
            const index = selected.indexOf(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => toggle(e.id)}
                  aria-pressed={index >= 0}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      index >= 0 && "border-primary bg-primary text-primary-foreground",
                    )}
                  >
                    {index >= 0 ? index + 1 : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.muscleGroups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")}
                    </span>
                  </span>
                  {alreadyAdded.has(e.id) ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3.5" />в тренировке
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено</li>
          ) : null}
        </ul>

        <DialogFooter>
          <Button onClick={confirm} disabled={selected.length === 0}>
            Добавить{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
